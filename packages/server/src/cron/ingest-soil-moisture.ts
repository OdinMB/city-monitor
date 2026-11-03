/**
 * The drought tile: daily soil moisture under grass at the city's DWD climate
 * stations (the DWD's AMBAV model, "Berechnete aktuelle Tageswerte … aus dem
 * Boden", CC BY 4.0), and for Berlin the street-tree waterings residents log
 * on Gieß den Kiez (Technologiestiftung Berlin, CC0). See .context/soil-moisture.md.
 */
import { gunzipSync } from 'node:zlib';
import type {
  SoilMoistureData, SoilMoistureDay, SoilMoistureStation, TreeWateringPeriod, TreeWateringSummary,
} from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveSoilMoisture } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { responseLines } from '../lib/stream-lines.js';

const log = createLogger('ingest-soil-moisture');

const DWD_SOIL_BASE = 'https://opendata.dwd.de/climate_environment/CDC/derived_germany/soil/daily/recent';
const HEADERS = { 'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)' };
const DWD_TIMEOUT_MS = 30_000;
/** The Gieß den Kiez CSV holds every watering since 2020: about 8 MB in 2026-11. */
const WATERING_TIMEOUT_MS = 90_000;
/** Two days: a failed run or two keeps the data; the DB fallback has its own 7-day limit. */
export const SOIL_MOISTURE_TTL_SECONDS = 172_800;
/** Days of the stations' mean the tile draws. */
export const HISTORY_DAYS = 90;

const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function stationFileUrl(stationId: string): string {
  return `${DWD_SOIL_BASE}/derived_germany_soil_daily_recent_v2_${stationId}.txt.gz`;
}

/** "20261101" → "2026-11-01", or null. */
function dwdDate(s: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * The days of one station's file (semicolon text, a header row naming the
 * columns): soil moisture under grass on sandy (BFGS_AG) and loamy (BFGL_AG)
 * soil, oldest first. A day missing either value (DWD writes -999) is left out.
 */
export function parseDwdSoilFile(text: string): SoilMoistureDay[] {
  const lines = text.split(/\r?\n/);
  const header = lines[0]?.split(';').map((s) => s.trim());
  if (!header) return [];
  const iDate = header.indexOf('Datum');
  const iSandy = header.indexOf('BFGS_AG');
  const iLoamy = header.indexOf('BFGL_AG');
  if (iDate < 0 || iSandy < 0 || iLoamy < 0) throw new Error('DWD soil file lacks Datum, BFGS_AG or BFGL_AG');

  const days: SoilMoistureDay[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(';');
    if (cols.length <= Math.max(iDate, iSandy, iLoamy)) continue;
    const date = dwdDate(cols[iDate]!.trim());
    const sandy = Number(cols[iSandy]!.trim());
    const loamy = Number(cols[iLoamy]!.trim());
    if (!date || !Number.isFinite(sandy) || !Number.isFinite(loamy) || sandy < 0 || loamy < 0) continue;
    days.push({ date, sandy, loamy });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The stations' daily mean over the last `days` days that every station has,
 * oldest first: a day one station lacks would make the mean jump.
 */
export function meanHistory(series: SoilMoistureDay[][], days = HISTORY_DAYS): SoilMoistureDay[] {
  const present = series.filter((s) => s.length > 0);
  if (present.length === 0) return [];
  const byDate = new Map<string, SoilMoistureDay[]>();
  for (const s of present) {
    for (const d of s) {
      const list = byDate.get(d.date) ?? [];
      list.push(d);
      byDate.set(d.date, list);
    }
  }
  return [...byDate]
    .filter(([, list]) => list.length === present.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-days)
    .map(([date, list]) => ({
      date,
      sandy: round1(list.reduce((s, d) => s + d.sandy, 0) / list.length),
      loamy: round1(list.reduce((s, d) => s + d.loamy, 0) / list.length),
    }));
}

interface Watering { tree: string; district: string; date: string; litres: number }

/**
 * The rows of Gieß den Kiez's watering CSV (semicolon, a header row; columns
 * `id`, `bezirk`, `timestamp` "2026-10-01 00:00:00+00:00",
 * `bewaesserungsmenge_in_liter`). Rows without a date or a positive amount are skipped.
 */
export function parseWateringCsv(text: string): Watering[] {
  const parser = createWateringParser();
  for (const line of (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/)) parser.line(line);
  return parser.rows;
}

/**
 * The same parse line by line, for the ~8 MB download streamed in
 * (`streamLines`): the whole text and its array of lines are never held.
 */
export async function parseWateringLines(lines: AsyncIterable<string>): Promise<Watering[]> {
  const parser = createWateringParser();
  for await (const line of lines) parser.line(line);
  return parser.rows;
}

function createWateringParser() {
  let header: string[] | null = null;
  let iTree = -1, iDistrict = -1, iTime = -1, iLitres = -1;
  const rows: Watering[] = [];
  return {
    rows,
    line(line: string): void {
      if (!header) {
        header = line.split(';').map((s) => s.trim());
        iTree = header.indexOf('id');
        iDistrict = header.indexOf('bezirk');
        iTime = header.indexOf('timestamp');
        iLitres = header.indexOf('bewaesserungsmenge_in_liter');
        if (iTree < 0 || iTime < 0 || iLitres < 0) throw new Error('Gieß den Kiez CSV lacks id, timestamp or bewaesserungsmenge_in_liter');
        return;
      }
      const cols = line.split(';');
      if (cols.length !== header.length) return;
      const date = /^\d{4}-\d{2}-\d{2}/.exec(cols[iTime]!.trim())?.[0];
      const litres = Number(cols[iLitres]);
      if (!date || !Number.isFinite(litres) || litres <= 0) return;
      rows.push({ tree: cols[iTree]!.trim(), district: iDistrict >= 0 ? cols[iDistrict]!.trim() : '', date, litres });
    },
  };
}

function period(rows: Watering[]): TreeWateringPeriod {
  return {
    litres: Math.round(rows.reduce((s, r) => s + r.litres, 0)),
    waterings: rows.length,
    trees: new Set(rows.map((r) => r.tree)).size,
  };
}

/**
 * The tile's watering figures: the 30 days up to the newest logged day, that
 * day's calendar year and the year before, and the year's top Bezirke. Days
 * after `now` (clock skew in the source) are ignored. Null without any row.
 */
export function summarizeWatering(rows: Watering[], now: Date): TreeWateringSummary | null {
  const today = now.toISOString().slice(0, 10);
  const valid = rows.filter((r) => r.date <= today);
  if (valid.length === 0) return null;
  const dataThrough = valid.reduce((max, r) => (r.date > max ? r.date : max), valid[0]!.date);
  const from30 = new Date(Date.parse(`${dataThrough}T00:00:00Z`) - 29 * DAY_MS).toISOString().slice(0, 10);
  const year = Number(dataThrough.slice(0, 4));
  const inYear = (y: number) => valid.filter((r) => r.date.startsWith(`${y}-`));
  const season = inYear(year);

  const byDistrict = new Map<string, number>();
  for (const r of season) {
    if (r.district) byDistrict.set(r.district, (byDistrict.get(r.district) ?? 0) + r.litres);
  }
  const topDistricts = [...byDistrict]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([district, litres]) => ({ district, litres: Math.round(litres) }));

  return {
    dataThrough,
    last30Days: period(valid.filter((r) => r.date >= from30 && r.date <= dataThrough)),
    season: { year, ...period(season) },
    previousSeason: { year: year - 1, ...period(inYear(year - 1)) },
    topDistricts,
  };
}

async function fetchStation(id: string): Promise<SoilMoistureDay[]> {
  const res = await log.fetch(stationFileUrl(id), { signal: AbortSignal.timeout(DWD_TIMEOUT_MS), headers: HEADERS });
  if (!res.ok) throw new Error(`DWD soil file for station ${id} returned ${res.status}`);
  const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('latin1');
  return parseDwdSoilFile(text);
}

async function fetchWatering(csvUrl: string, now: Date): Promise<TreeWateringSummary | null> {
  const res = await log.fetch(csvUrl, { signal: AbortSignal.timeout(WATERING_TIMEOUT_MS), headers: HEADERS });
  if (!res.ok) throw new Error(`Gieß den Kiez CSV returned ${res.status}`);
  return summarizeWatering(await parseWateringLines(responseLines(res)), now);
}

export function createSoilMoistureIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestSoilMoisture(): Promise<void> {
    const cities = getActiveCities().filter((c) => (c.dataSources.soilMoisture?.stations.length ?? 0) > 0);
    if (cities.length === 0) return;
    const now = new Date();

    for (const city of cities) {
      const source = city.dataSources.soilMoisture!;
      try {
        const results = await Promise.all(source.stations.map(async (s) => {
          try {
            return { station: s, days: await fetchStation(s.id) };
          } catch (err) {
            log.warn(`${city.id}: station ${s.id} (${s.name}) failed: ${err instanceof Error ? err.message : String(err)}`);
            return { station: s, days: [] as SoilMoistureDay[] };
          }
        }));

        const prev = cache.get<SoilMoistureData>(CK.soilMoisture(city.id));
        const fetched = results.filter((r) => r.days.length > 0);
        const stations: SoilMoistureStation[] = fetched.map(({ station, days }) => ({ id: station.id, name: station.name, ...days.at(-1)! }));
        const history = meanHistory(fetched.map((r) => r.days));

        let watering: TreeWateringSummary | null = null;
        if (source.treeWatering) {
          try {
            watering = await fetchWatering(source.treeWatering.csvUrl, now);
          } catch (err) {
            log.warn(`${city.id}: Gieß den Kiez failed: ${err instanceof Error ? err.message : String(err)}`);
            watering = prev?.watering ?? null;
          }
        }

        // Every station failed: keep the last run's readings rather than show none
        const data: SoilMoistureData = history.length > 0
          ? { stations, history, watering }
          : prev ? { ...prev, watering } : { stations: [], history: [], watering };
        if (data.history.length === 0) {
          log.warn(`${city.id}: no soil moisture from any DWD station`);
          continue;
        }

        cache.set(CK.soilMoisture(city.id), data, SOIL_MOISTURE_TTL_SECONDS);
        if (db) {
          try {
            await saveSoilMoisture(db, city.id, data);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        const last = data.history.at(-1)!;
        log.info(`${city.id}: ${last.sandy}% nFK (sandy) on ${last.date} from ${data.stations.length} station(s)${watering ? `, waterings through ${watering.dataThrough}` : ''}`);
      } catch (err) {
        log.error(`${city.id} soil moisture failed`, err);
      }
    }
  };
}
