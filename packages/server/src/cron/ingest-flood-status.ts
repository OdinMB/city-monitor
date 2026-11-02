/**
 * Flood class at state flood gauges and regional flood warnings, from the
 * public API of the Länderübergreifendes Hochwasserportal (LHP):
 * https://www.hochwasserzentralen.de/developers/ (CC BY 4.0).
 *
 * For rivers PEGELONLINE lacks (the Isar in München). The API gives each
 * gauge's flood class and the active warnings, but no water levels. Its terms
 * ask for the credit "Datenquelle: www.hochwasserzentralen.de" as a link, the
 * data's `updated` time shown as "Stand", and a refresh at least every 10
 * minutes; the job runs every 5 (app.ts).
 */
import type { CityConfig, FloodAlert, FloodClass, FloodGauge, FloodStatus } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveFloodStatus } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { berlinUtcOffset } from './ingest-council-meetings.js';

const log = createLogger('ingest-flood-status');

export const LHP_API_BASE = 'https://api.hochwasserzentralen.de/public/v1';
const FETCH_TIMEOUT_MS = 15_000;
/** Twice the job interval: a missed run keeps the last answer, a second one lets it expire. */
export const FLOOD_STATUS_TTL_SECONDS = 600;
const USER_AGENT = 'CityMonitor/1.0 (https://github.com/OdinMB/city-monitor)';

type FloodStatusConfig = NonNullable<CityConfig['dataSources']['floodStatus']>;

/** One gauge as the LHP stations endpoint gives it (Accept: application/json). */
export interface LhpStation {
  id: string;
  lat: number | null;
  lon: number | null;
  /** -1 when LHP has no current data, else 0–4. */
  lhpClass: number;
  stateClassName: string | null;
  /** Local time in Germany, "2026-11-01 20:30:00". */
  timestamp: string | null;
  stationLink: string | null;
}

/** One warning area as the LHP alerts endpoint gives it (Accept: application/geo+json). */
export interface LhpAlert {
  id: string;
  headline: string;
  area: string;
  level: number;
  levelName: string;
  url: string | null;
  geometry: { type: string; coordinates: unknown } | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** The response's items: `data` in the JSON format, `features` in GeoJSON. */
function items(json: Record<string, unknown>): Array<Record<string, unknown>> {
  const list = Array.isArray(json.features) ? json.features : Array.isArray(json.data) ? json.data : [];
  return list.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
}

/** An item's fields: in `properties` (GeoJSON) or on the item itself (JSON). */
function fields(item: Record<string, unknown>): Record<string, unknown> {
  const p = item.properties;
  return typeof p === 'object' && p !== null ? { ...item, ...(p as Record<string, unknown>) } : item;
}

/** The time LHP last updated a response (its `updated`; the OpenAPI example calls it `update`). */
export function lhpUpdated(json: Record<string, unknown>): string | null {
  const raw = str(json.updated) ?? str(json.update);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

/** Parse the stations endpoint. Null unless it answers `status: success`. */
export function parseLhpStations(json: Record<string, unknown>): LhpStation[] | null {
  if (json.status !== 'success') return null;
  const out: LhpStation[] = [];
  for (const item of items(json)) {
    const f = fields(item);
    const id = str(f.id);
    if (!id) continue;
    const geometry = f.geometry as { coordinates?: unknown } | undefined;
    const coords = (Array.isArray(f.coordinates) ? f.coordinates : geometry?.coordinates) as unknown[] | undefined;
    out.push({
      id,
      lon: num(coords?.[0]),
      lat: num(coords?.[1]),
      lhpClass: num(f.lhpClass) ?? -1,
      stateClassName: str(f.stateClassName),
      timestamp: str(f.timestamp),
      stationLink: str(f.stationLink),
    });
  }
  return out;
}

/** Parse the alerts endpoint. Null unless it answers `status: success`. */
export function parseLhpAlerts(json: Record<string, unknown>): LhpAlert[] | null {
  if (json.status !== 'success') return null;
  const out: LhpAlert[] = [];
  for (const item of items(json)) {
    const f = fields(item);
    const id = str(f.id);
    const level = num(f.lhpClass);
    if (!id || level === null) continue;
    const geometry = f.geometry as { type?: unknown; coordinates?: unknown } | undefined;
    out.push({
      id,
      headline: str(f.alertHeadline) ?? str(f.lhpClassName) ?? '',
      area: str(f.areaDesc) ?? '',
      level,
      levelName: str(f.lhpClassName) ?? '',
      url: str(f.alertLink),
      geometry: geometry && typeof geometry.type === 'string' ? { type: geometry.type, coordinates: geometry.coordinates } : null,
    });
  }
  return out;
}

/** "2026-11-01 20:30:00" (German local time) as ISO 8601 with its offset. */
export function lhpLocalToIso(timestamp: string | null): string | null {
  if (!timestamp || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(timestamp)) return null;
  const local = timestamp.replace(' ', 'T');
  return `${local.length === 16 ? `${local}:00` : local}${berlinUtcOffset(timestamp)}`;
}

const toClass = (lhpClass: number): FloodClass | null =>
  Number.isInteger(lhpClass) && lhpClass >= 0 && lhpClass <= 4 ? (lhpClass as FloodClass) : null;

/** The configured gauges, in config order. A gauge LHP did not list has no class. */
export function toFloodGauges(stations: LhpStation[], config: FloodStatusConfig): FloodGauge[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  return config.stations.map((cfg): FloodGauge => {
    const s = byId.get(cfg.id);
    const floodClass = s ? toClass(s.lhpClass) : null;
    return {
      id: cfg.id,
      name: cfg.name,
      waterBody: cfg.waterBody,
      upstream: cfg.upstream ?? false,
      floodClass,
      stateLabel: floodClass === null ? null : s?.stateClassName ?? null,
      measuredAt: lhpLocalToIso(s?.timestamp ?? null),
      url: s?.stationLink ?? null,
    };
  });
}

type Position = [lon: number, lat: number];

function inRing(ring: unknown, [lon, lat]: Position): boolean {
  if (!Array.isArray(ring)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as number[];
    const [xj, yj] = ring[j] as number[];
    if (yi === undefined || yj === undefined || xi === undefined || xj === undefined) continue;
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether a point lies in a Polygon or MultiPolygon (in an outer ring, outside its holes). */
function inPolygonal(geometry: { type: string; coordinates: unknown }, p: Position): boolean {
  const polygons = (geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates]) as unknown[];
  if (!Array.isArray(polygons)) return false;
  return polygons.some((poly) => {
    if (!Array.isArray(poly) || poly.length === 0) return false;
    const [outer, ...holes] = poly;
    return inRing(outer, p) && !holes.some((h) => inRing(h, p));
  });
}

function positions(coords: unknown): Position[] {
  if (!Array.isArray(coords)) return [];
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') return [[coords[0], coords[1]]];
  return coords.flatMap(positions);
}

/**
 * Whether a warning concerns the city: a warned region (Polygon or
 * MultiPolygon) that contains the city centre or one of its own (not
 * upstream) gauges; a river section given as a line or point with a vertex
 * inside the city's bounding box; or, with no geometry at all, an area named
 * after the city.
 */
export function alertConcernsCity(alert: LhpAlert, city: Pick<CityConfig, 'name' | 'coordinates' | 'boundingBox'>, gaugePoints: Position[]): boolean {
  const { geometry } = alert;
  if (!geometry) return alert.area.includes(city.name);
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const points: Position[] = [[city.coordinates.lon, city.coordinates.lat], ...gaugePoints];
    return points.some((p) => inPolygonal(geometry, p));
  }
  const { north, south, east, west } = city.boundingBox;
  return positions(geometry.coordinates).some(([lon, lat]) => lat >= south && lat <= north && lon >= west && lon <= east);
}

/** Build a city's flood status from the two parsed responses. */
export function buildFloodStatus(
  city: Pick<CityConfig, 'name' | 'coordinates' | 'boundingBox'> & { dataSources: { floodStatus?: FloodStatusConfig } },
  stations: LhpStation[],
  alerts: LhpAlert[],
  updated: string,
): FloodStatus | null {
  const config = city.dataSources.floodStatus;
  if (!config) return null;
  const own = new Set(config.stations.filter((s) => !s.upstream).map((s) => s.id));
  const gaugePoints = stations
    .filter((s) => own.has(s.id) && s.lat !== null && s.lon !== null)
    .map((s): Position => [s.lon!, s.lat!]);
  const cityAlerts = alerts
    .filter((a) => alertConcernsCity(a, city, gaugePoints))
    .sort((a, b) => b.level - a.level)
    .map(({ geometry: _geometry, ...a }): FloodAlert => a);
  return { gauges: toFloodGauges(stations, config), alerts: cityAlerts, updated };
}

async function fetchJson(url: string, accept: string): Promise<Record<string, unknown>> {
  const res = await log.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: accept, 'Accept-Language': 'de', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

interface StateData {
  stations: LhpStation[];
  alerts: LhpAlert[];
  updated: string;
}

/** Both endpoints for one state. Throws when either fails: without the warnings the tile would claim there are none. */
async function fetchState(state: string): Promise<StateData> {
  const q = `states=${encodeURIComponent(state)}`;
  const [stationsJson, alertsJson] = await Promise.all([
    fetchJson(`${LHP_API_BASE}/data/stations?${q}`, 'application/json'),
    fetchJson(`${LHP_API_BASE}/data/alerts?${q}`, 'application/geo+json'),
  ]);
  const stations = parseLhpStations(stationsJson);
  const alerts = parseLhpAlerts(alertsJson);
  const updated = lhpUpdated(stationsJson);
  if (!stations || !alerts || !updated) throw new Error(`LHP ${state}: unexpected response`);
  return { stations, alerts, updated };
}

export function createFloodStatusIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestFloodStatus(): Promise<void> {
    const cities = getActiveCities().filter((c) => (c.dataSources.floodStatus?.stations.length ?? 0) > 0);
    // One request pair per state, shared by its cities
    const byState = new Map<string, Promise<StateData>>();
    for (const city of cities) {
      const config = city.dataSources.floodStatus!;
      try {
        let pending = byState.get(config.state);
        if (!pending) {
          pending = fetchState(config.state);
          byState.set(config.state, pending);
        }
        const { stations, alerts, updated } = await pending;
        const status = buildFloodStatus(city, stations, alerts, updated);
        if (!status) continue;

        const missing = status.gauges.filter((g) => !stations.some((s) => s.id === g.id)).map((g) => g.id);
        if (missing.length > 0) log.warn(`${city.id}: LHP lists no gauge ${missing.join(', ')}`);

        cache.set(CK.floodStatus(city.id), status, FLOOD_STATUS_TTL_SECONDS);
        if (db) {
          try {
            await saveFloodStatus(db, city.id, status);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        const classes = status.gauges.map((g) => `${g.name}=${g.floodClass ?? '-'}`).join(' ');
        log.info(`${city.id}: flood status ${classes}, ${status.alerts.length} warning(s)`);
      } catch (err) {
        log.error(`${city.id} flood status failed`, err);
      }
    }
  };
}
