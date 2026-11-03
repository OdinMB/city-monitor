/**
 * The electricity tile: generation by source in the control area whose grid
 * serves the city (SMARD, Bundesnetzagentur, CC BY 4.0) and Germany's grid
 * traffic light, renewable share of load and CO₂ intensity (Energy-Charts,
 * Fraunhofer ISE, CC BY 4.0), which no source gives per region. SMARD's
 * day-ahead prices are left out: its licence page asks not to reuse wholesale
 * prices until further notice. See .context/electricity.md.
 */
import type {
  ControlArea, ElectricityData, ElectricityMix, GenerationKind, GridPoint, GridSignal,
} from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveElectricity } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-electricity');

const SMARD_BASE = 'https://www.smard.de/app/chart_data';
const ENERGY_CHARTS_BASE = 'https://api.energy-charts.info';
const FETCH_TIMEOUT_MS = 20_000;
const HEADERS = { 'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)', Accept: 'application/json' };
/** Two job runs: a missed run keeps the data, a second one lets it lapse to the DB fallback. */
export const ELECTRICITY_TTL_SECONDS = 1800;

const QUARTER_HOUR_MS = 15 * 60_000;
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * SMARD's generation filters (quarter-hour, MWh per quarter-hour). Nuclear
 * (1224) is left out: the last plants closed in April 2023 and SMARD has no
 * series for it in the control areas any more.
 */
export const SMARD_FILTERS: ReadonlyArray<[GenerationKind, number]> = [
  ['windOffshore', 1225],
  ['windOnshore', 4067],
  ['solar', 4068],
  ['biomass', 4066],
  ['hydro', 1226],
  ['otherRenewable', 1228],
  ['lignite', 1223],
  ['hardCoal', 4069],
  ['gas', 4071],
  ['pumpedStorage', 4070],
  ['otherConventional', 1227],
];

/** The kinds SMARD counts as renewable; pumped storage is not. */
export const RENEWABLE_KINDS: ReadonlySet<GenerationKind> = new Set([
  'windOffshore', 'windOnshore', 'solar', 'biomass', 'hydro', 'otherRenewable',
]);

/** One SMARD series: [epoch ms, MWh in that quarter-hour or null when not yet published]. */
export type SmardSeries = Array<[number, number | null]>;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The `series` of a SMARD chart_data file, or null when the body is not one. */
export function parseSmardSeries(json: unknown): SmardSeries | null {
  const series = (json as { series?: unknown } | null)?.series;
  if (!Array.isArray(series)) return null;
  const out: SmardSeries = [];
  for (const point of series) {
    if (!Array.isArray(point) || typeof point[0] !== 'number') continue;
    out.push([point[0], typeof point[1] === 'number' ? point[1] : null]);
  }
  return out;
}

/** Timestamps (ms) at which every kind with a series has a value, ascending. */
function commonTimestamps(series: ReadonlyMap<GenerationKind, SmardSeries>): number[] {
  const present = [...series.values()].filter((s) => s.length > 0);
  if (present.length === 0) return [];
  const counts = new Map<number, number>();
  for (const s of present) {
    for (const [t, v] of s) if (v !== null) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n === present.length).map(([t]) => t).sort((a, b) => a - b);
}

/**
 * The newest quarter-hour every series of the area has reached, and the hourly
 * renewable share over the 24 hours up to it. `series` holds each kind's
 * quarter-hours (a kind the area has no series for is absent or empty).
 */
export function buildMix(series: ReadonlyMap<GenerationKind, SmardSeries>): Pick<ElectricityData, 'mix' | 'renewableHistory'> {
  const times = commonTimestamps(series);
  const values = new Map<GenerationKind, Map<number, number>>();
  for (const [kind, s] of series) {
    if (s.length === 0) continue;
    values.set(kind, new Map(s.filter((p): p is [number, number] => p[1] !== null)));
  }

  const split = (t: number) => {
    let renewable = 0;
    let total = 0;
    for (const [kind, byTime] of values) {
      const v = Math.max(0, byTime.get(t) ?? 0);
      total += v;
      if (RENEWABLE_KINDS.has(kind)) renewable += v;
    }
    return { renewable, total };
  };

  const last = times.at(-1);
  if (last === undefined) return { mix: null, renewableHistory: [] };
  const { renewable, total } = split(last);
  if (total <= 0) return { mix: null, renewableHistory: [] };

  const mw: ElectricityMix['mw'] = {};
  for (const [kind, byTime] of values) {
    // MWh in a quarter-hour × 4 = average MW
    mw[kind] = Math.round(Math.max(0, byTime.get(last) ?? 0) * 4);
  }
  const mix: ElectricityMix = { at: new Date(last).toISOString(), mw, renewableShare: round1((renewable / total) * 100) };

  // The hour of `last` and the 23 before it, so the first hour is whole
  const firstHour = Math.floor(last / HOUR_MS) * HOUR_MS - DAY_MS + HOUR_MS;
  const hours = new Map<number, { renewable: number; total: number }>();
  for (const t of times) {
    if (t < firstHour) continue;
    const hour = Math.floor(t / HOUR_MS) * HOUR_MS;
    const sum = hours.get(hour) ?? { renewable: 0, total: 0 };
    const q = split(t);
    sum.renewable += q.renewable;
    sum.total += q.total;
    hours.set(hour, sum);
  }
  const renewableHistory = [...hours]
    .sort(([a], [b]) => a - b)
    .filter(([, s]) => s.total > 0)
    .map(([hour, s]) => ({ t: new Date(hour).toISOString(), share: round1((s.renewable / s.total) * 100) }));

  return { mix, renewableHistory };
}

interface EnergyChartsSignal { unix_seconds?: unknown; share?: unknown; signal?: unknown; substitute?: unknown }
interface EnergyChartsCo2 { unix_seconds?: unknown; co2eq?: unknown; co2eq_forecast?: unknown }

const numAt = (arr: unknown, i: number): number | null => {
  const v = Array.isArray(arr) ? arr[i] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Energy-Charts' `/signal` and `/co2eq` answers (either may be null) as quarter-hours, ascending. */
export function buildGrid(signal: EnergyChartsSignal | null, co2: EnergyChartsCo2 | null): GridPoint[] {
  const points = new Map<number, GridPoint>();
  const at = (seconds: number) => {
    let p = points.get(seconds);
    if (!p) {
      p = { t: new Date(seconds * 1000).toISOString(), share: null, signal: null, co2: null, co2Forecast: null };
      points.set(seconds, p);
    }
    return p;
  };

  if (signal && Array.isArray(signal.unix_seconds)) {
    signal.unix_seconds.forEach((s, i) => {
      if (typeof s !== 'number') return;
      const p = at(s);
      const share = numAt(signal.share, i);
      p.share = share === null ? null : round1(share);
      const level = numAt(signal.signal, i);
      p.signal = level !== null && [-1, 0, 1, 2].includes(level) ? (level as GridSignal) : null;
    });
  }
  if (co2 && Array.isArray(co2.unix_seconds)) {
    co2.unix_seconds.forEach((s, i) => {
      if (typeof s !== 'number') return;
      const p = at(s);
      const measured = numAt(co2.co2eq, i);
      const forecast = numAt(co2.co2eq_forecast, i);
      p.co2 = measured === null ? null : Math.round(measured);
      p.co2Forecast = forecast === null ? null : Math.round(forecast);
    });
  }
  return [...points].sort(([a], [b]) => a - b).map(([, p]) => p);
}

async function getJson(url: string): Promise<{ status: number; json: unknown }> {
  const res = await log.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: HEADERS });
  if (!res.ok) return { status: res.status, json: null };
  return { status: res.status, json: await res.json() };
}

/** Each kind's quarter-hours in the SMARD week starting at `week` (ms). A 404 is a series the area does not have. */
async function fetchSmardWeek(area: ControlArea, week: number): Promise<Map<GenerationKind, SmardSeries>> {
  const entries = await Promise.all(SMARD_FILTERS.map(async ([kind, filter]): Promise<[GenerationKind, SmardSeries]> => {
    const { status, json } = await getJson(`${SMARD_BASE}/${filter}/${area}/${filter}_${area}_quarterhour_${week}.json`);
    if (status === 404) return [kind, []];
    const series = status === 200 ? parseSmardSeries(json) : null;
    // A failed series with data would skew the share: fail the whole area instead
    if (!series) throw new Error(`SMARD ${filter} for ${area} returned ${status}`);
    return [kind, series];
  }));
  return new Map(entries);
}

/** The area's mix, reading the previous week too while the current one holds less than a day. */
async function fetchAreaMix(area: ControlArea): Promise<Pick<ElectricityData, 'mix' | 'renewableHistory'> | null> {
  const { json } = await getJson(`${SMARD_BASE}/4068/${area}/index_quarterhour.json`);
  const weeks = (json as { timestamps?: unknown } | null)?.timestamps;
  if (!Array.isArray(weeks) || weeks.length === 0) {
    log.warn(`SMARD index for ${area} has no weeks`);
    return null;
  }
  const latest = weeks.at(-1) as number;
  let series = await fetchSmardWeek(area, latest);
  let result = buildMix(series);
  const reached = result.mix ? Date.parse(result.mix.at) : null;
  if (weeks.length > 1 && (reached === null || reached - latest < DAY_MS - QUARTER_HOUR_MS)) {
    const older = await fetchSmardWeek(area, weeks.at(-2) as number);
    series = new Map(SMARD_FILTERS.map(([kind]) => [kind, [...(older.get(kind) ?? []), ...(series.get(kind) ?? [])]]));
    result = buildMix(series);
  }
  return result.mix ? result : null;
}

async function fetchGrid(): Promise<GridPoint[]> {
  const get = async <T>(path: string): Promise<T | null> => {
    try {
      const { status, json } = await getJson(`${ENERGY_CHARTS_BASE}${path}`);
      if (status !== 200) {
        log.warn(`Energy-Charts ${path} returned ${status}`);
        return null;
      }
      return json as T;
    } catch (err) {
      log.warn(`Energy-Charts ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };
  // Germany-wide: Energy-Charts has no control areas, and `postal_code` does not change /signal yet
  const [signal, co2] = await Promise.all([
    get<EnergyChartsSignal>('/signal?country=de'),
    get<EnergyChartsCo2>('/co2eq?country=de'),
  ]);
  return buildGrid(signal, co2);
}

export function createElectricityIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestElectricity(): Promise<void> {
    const cities = getActiveCities().filter((c) => c.dataSources.electricity);
    if (cities.length === 0) return;

    const grid = await fetchGrid();
    const areas = new Map<ControlArea, Promise<Pick<ElectricityData, 'mix' | 'renewableHistory'> | null>>();
    const areaMix = (area: ControlArea) => {
      let p = areas.get(area);
      if (!p) {
        p = fetchAreaMix(area).catch((err) => {
          log.error(`SMARD ${area} failed`, err);
          return null;
        });
        areas.set(area, p);
      }
      return p;
    };

    for (const city of cities) {
      const area = city.dataSources.electricity!.controlArea;
      try {
        const fresh = await areaMix(area);
        // A part that failed this run keeps the last run's: each carries its own time
        const prev = cache.get<ElectricityData>(CK.electricity(city.id));
        const data: ElectricityData = {
          controlArea: area,
          mix: fresh?.mix ?? prev?.mix ?? null,
          renewableHistory: fresh?.renewableHistory ?? prev?.renewableHistory ?? [],
          grid: grid.length > 0 ? grid : prev?.grid ?? [],
        };
        if (!data.mix && data.grid.length === 0) {
          log.warn(`${city.id}: no electricity data from SMARD or Energy-Charts`);
          continue;
        }
        cache.set(CK.electricity(city.id), data, ELECTRICITY_TTL_SECONDS);
        if (db) {
          try {
            await saveElectricity(db, city.id, data);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        log.info(`${city.id}: ${area} ${data.mix?.renewableShare ?? '?'}% renewable at ${data.mix?.at ?? '?'}, ${data.grid.length} grid quarter-hours`);
      } catch (err) {
        log.error(`${city.id} electricity failed`, err);
      }
    }
  };
}
