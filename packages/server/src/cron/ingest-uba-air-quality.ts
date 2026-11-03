/**
 * Official air quality measuring stations of the state networks (BLUME,
 * Hamburger Luftmessnetz, LANUK NRW, LfU Bayern and the rest), from the
 * Umweltbundesamt's Air Data API v4:
 * https://luftdaten.umweltbundesamt.de/api/air-data/v4/ (dl-de/by-2-0).
 *
 * Two requests per run for all cities: the station list (names, positions,
 * type) and the air quality index with its component values for every German
 * station over the last few hours. Each city keeps its configured stations
 * (`dataSources.airQuality.ubaStations`) with their latest measured hour.
 *
 * The API's required source line is "Umweltbundesamt mit Daten der Messnetze
 * der Länder und des Bundes". Data of the current year are not yet audited
 * and may have gaps (OpenAPI spec, info.description).
 */
import type { AirQualityStation, CityConfig, UbaAirIndex } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveAirQualityStations } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { berlinUtcOffset } from './ingest-council-meetings.js';

const log = createLogger('ingest-uba-air-quality');

export const UBA_API_BASE = 'https://luftdaten.umweltbundesamt.de/api/air-data/v4';
const FETCH_TIMEOUT_MS = 30_000;
/** Four job intervals: a few failed runs keep the last readings, which are hourly anyway. */
export const AIR_QUALITY_STATIONS_TTL_SECONDS = 7200;
/** How far back the values request reaches: UBA publishes about one to two hours behind. */
const WINDOW_HOURS = 6;
const USER_AGENT = 'CityMonitor/1.0 (https://github.com/OdinMB/city-monitor)';

/** UBA component ids (`/components/json`). */
const COMPONENT = { pm10: 1, o3: 3, no2: 5, pm25: 9 } as const;

/** One station of the UBA station list, reduced to what the map and tile use. */
export interface UbaStationMeta {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  network: string;
  setting: AirQualityStation['setting'];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** Station type, by its German or English name, else by UBA's type id (1 background, 2 industrial, 3 traffic). */
function toSetting(name: string | null, id: number | null): AirQualityStation['setting'] | null {
  const n = name?.toLowerCase() ?? '';
  if (n.startsWith('verkehr') || n.startsWith('traffic') || (!n && id === 3)) return 'traffic';
  if (n.startsWith('hintergrund') || n.startsWith('background') || (!n && id === 1)) return 'background';
  if (n.startsWith('industrie') || n.startsWith('industr') || (!n && id === 2)) return 'industrial';
  return null;
}

/**
 * Parse `/stations/json`: rows keyed by station id, their columns named in
 * `indices`. Returns the stations by code; null when the response lacks the
 * columns it needs (a changed format).
 */
export function parseUbaStations(json: unknown): Map<string, UbaStationMeta> | null {
  if (typeof json !== 'object' || json === null) return null;
  const { indices, data } = json as { indices?: unknown; data?: unknown };
  if (!Array.isArray(indices) || typeof data !== 'object' || data === null) return null;
  const col = (name: string) => indices.indexOf(name);
  const c = {
    id: col('station id'), code: col('station code'), name: col('station name'),
    lon: col('station longitude'), lat: col('station latitude'), network: col('network code'),
    typeName: col('station type name'), typeId: col('station type id'),
  };
  if ([c.id, c.code, c.name, c.lon, c.lat].some((i) => i < 0)) return null;

  const out = new Map<string, UbaStationMeta>();
  for (const row of Object.values(data as Record<string, unknown>)) {
    if (!Array.isArray(row)) continue;
    const id = str(row[c.id]);
    const code = str(row[c.code]);
    const name = str(row[c.name]);
    const lat = num(row[c.lat]);
    const lon = num(row[c.lon]);
    const setting = toSetting(c.typeName >= 0 ? str(row[c.typeName]) : null, c.typeId >= 0 ? num(row[c.typeId]) : null);
    if (!id || !code || !name || lat === null || lon === null || !setting) continue;
    out.set(code, { id, code, name, lat, lon, setting, network: (c.network >= 0 ? str(row[c.network]) : null) ?? code.slice(2, 4) });
  }
  return out;
}

/** The latest hour of one station in `/airquality/json`. */
export interface UbaReading {
  /** End of the hour, local German time as UBA writes it ("2026-11-02 24:00:00"). */
  end: string;
  index: UbaAirIndex | null;
  values: Partial<Record<keyof typeof COMPONENT, number>>;
}

const toIndex = (v: unknown): UbaAirIndex | null => {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= 0 && n <= 4 ? (n as UbaAirIndex) : null;
};

/**
 * Parse `/airquality/json`: per station id, entries keyed by the hour's start,
 * each `[end, index, incomplete, [component, value, index, decimal index]…]`.
 * Returns each station's latest hour; null when `data` is missing.
 */
export function parseUbaAirQuality(json: unknown): Map<string, UbaReading> | null {
  if (typeof json !== 'object' || json === null) return null;
  const data = (json as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;

  const byComponentId = new Map<number, keyof typeof COMPONENT>(
    (Object.entries(COMPONENT) as Array<[keyof typeof COMPONENT, number]>).map(([k, id]) => [id, k]),
  );
  const out = new Map<string, UbaReading>();
  for (const [stationId, hours] of Object.entries(data as Record<string, unknown>)) {
    if (typeof hours !== 'object' || hours === null) continue;
    // Keys are "YYYY-MM-DD HH:MM:SS", so the greatest string is the latest hour
    const latestStart = Object.keys(hours).sort().at(-1);
    const entry = latestStart ? (hours as Record<string, unknown>)[latestStart] : undefined;
    if (!Array.isArray(entry)) continue;
    const end = str(entry[0]);
    if (!end) continue;
    const values: UbaReading['values'] = {};
    for (const part of entry.slice(3)) {
      if (!Array.isArray(part)) continue;
      const key = byComponentId.get(num(part[0]) ?? -1);
      const value = num(part[1]);
      if (key && value !== null && value >= 0) values[key] = value;
    }
    out.set(stationId, { end, index: toIndex(entry[1]), values });
  }
  return out;
}

/**
 * A local German time as UBA writes it ("2026-11-02 24:00:00", hour 24 being
 * midnight of the next day) as UTC ISO 8601. Null when malformed.
 */
export function ubaLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  if (h > 24) return null;
  // As if it were UTC, rolling hour 24 over to the next day, then shifted by Germany's offset
  const naive = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const offset = berlinUtcOffset(naive.toISOString().slice(0, 19));
  const hours = offset === '+02:00' ? 2 : 1;
  return new Date(naive.getTime() - hours * 3_600_000).toISOString();
}

/** Date ("2026-11-03") and hour (0–23) of an instant on the German clock. */
function berlinClock(instant: Date): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/**
 * Query of the values request: from the hour that started `WINDOW_HOURS` ago
 * to the end of today, on the German clock. UBA numbers hours 1–24 by their end.
 */
export function ubaWindowQuery(now: Date): string {
  const from = berlinClock(new Date(now.getTime() - WINDOW_HOURS * 3_600_000));
  const to = berlinClock(now);
  return `date_from=${from.date}&time_from=${from.hour + 1}&date_to=${to.date}&time_to=24`;
}

/** The city's configured stations with their latest reading, in config order. */
export function toAirQualityStations(
  codes: readonly string[],
  stations: Map<string, UbaStationMeta>,
  readings: Map<string, UbaReading>,
): AirQualityStation[] {
  const out: AirQualityStation[] = [];
  for (const code of codes) {
    const meta = stations.get(code);
    const reading = meta ? readings.get(meta.id) : undefined;
    const measuredAt = reading ? ubaLocalToIso(reading.end) : null;
    if (!meta || !reading || !measuredAt) continue;
    out.push({
      code,
      name: meta.name,
      lat: meta.lat,
      lon: meta.lon,
      setting: meta.setting,
      network: meta.network,
      measuredAt,
      index: reading.index,
      no2: reading.values.no2 ?? null,
      pm10: reading.values.pm10 ?? null,
      pm25: reading.values.pm25 ?? null,
      o3: reading.values.o3 ?? null,
    });
  }
  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await log.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

const ubaCodes = (c: CityConfig) => c.dataSources.airQuality?.ubaStations ?? [];

export function createUbaAirQualityIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestUbaAirQuality(): Promise<void> {
    const cities = getActiveCities().filter((c) => ubaCodes(c).length > 0);
    if (cities.length === 0) return;

    let stations: Map<string, UbaStationMeta> | null;
    let readings: Map<string, UbaReading> | null;
    try {
      const [stationsJson, valuesJson] = await Promise.all([
        fetchJson(`${UBA_API_BASE}/stations/json?use=airquality&lang=de`),
        fetchJson(`${UBA_API_BASE}/airquality/json?${ubaWindowQuery(new Date())}`),
      ]);
      stations = parseUbaStations(stationsJson);
      readings = parseUbaAirQuality(valuesJson);
    } catch (err) {
      log.error('UBA request failed', err);
      return;
    }
    if (!stations || !readings) {
      log.error('UBA answered in an unexpected format');
      return;
    }

    for (const city of cities) {
      const codes = ubaCodes(city);
      const unknown = codes.filter((code) => !stations.has(code));
      if (unknown.length > 0) log.warn(`${city.id}: UBA lists no station ${unknown.join(', ')}`);

      const list = toAirQualityStations(codes, stations, readings);
      if (list.length === 0) {
        // Keep the previous readings until they expire
        log.warn(`${city.id}: no recent UBA readings for ${codes.length} station(s)`);
        continue;
      }
      cache.set(CK.airQualityStations(city.id), list, AIR_QUALITY_STATIONS_TTL_SECONDS);
      if (db) {
        try {
          await saveAirQualityStations(db, city.id, list);
        } catch (err) {
          log.error(`${city.id} DB write failed`, err);
        }
      }
      log.info(`${city.id}: ${list.length}/${codes.length} UBA stations, latest hour ending ${list[0].measuredAt}`);
    }
  };
}
