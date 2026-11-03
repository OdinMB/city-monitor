/**
 * Lift and escalator outages at a city's transit stations. KVB Köln publishes
 * its own: two GeoJSON lists on its open-data service, updated about every 15
 * minutes, dl-de/zero-2.0 (open.nrw datasets "Aufzüge KVB Köln" and
 * "Fahrtreppen KVB Köln"). Deutsche Bahn's FaSta API (CC BY 4.0) adds the DB
 * stations in every city, but only with DB_API_CLIENT_ID and DB_API_KEY set.
 * See .context/lift-outages.md.
 */
import type { CityConfig, LiftOutage, LiftOutageData, LiftOutageSource } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveLiftOutages } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { berlinUtcOffset } from './ingest-council-meetings.js';

const log = createLogger('ingest-lift-outages');

const FETCH_TIMEOUT_MS = 15_000;
/** Two job runs: a missed run keeps the list, a second one lets it lapse to the DB fallback. */
export const LIFT_OUTAGES_TTL_SECONDS = 1200;

/** KVB's two outage lists, by the kind of unit they hold. */
export const KVB_LISTS: ReadonlyArray<[LiftOutage['kind'], string]> = [
  ['lift', 'aufzugsstoerung'],
  ['escalator', 'fahrtreppenstoerung'],
];

/**
 * The body as text. KVB serves the lift list in UTF-8 but the escalator list
 * in ISO-8859-1, both as text/plain without a charset, so a body that is not
 * valid UTF-8 is read as Latin-1.
 */
export function decodeKvbBody(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

/** "Aufzug 04 - HÜ 011 (Dom/HBf.)" as unit and station; the whole text as the station otherwise. */
export function splitKvbName(name: string): { unit: string; station: string } {
  const m = name.match(/^(.*?)\s+-\s+H[ÜüU]e?\s*\d+\s*\((.+)\)\s*$/);
  if (m) return { unit: m[1]!.trim(), station: m[2]!.trim() };
  return { unit: '', station: name.trim() };
}

/** "2026-11-02T04:10:32" (German local time, no offset) as ISO 8601 with its offset. */
function kvbLocalToIso(timestamp: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(timestamp)) return null;
  return `${timestamp}${berlinUtcOffset(timestamp.replace('T', ' '))}`;
}

/**
 * One KVB list as outages of `kind`, with the newest `timestamp` in it; null
 * when the body is not the GeoJSON KVB sends.
 */
export function parseKvbList(json: unknown, kind: LiftOutage['kind']): { outages: LiftOutage[]; updated: string | null } | null {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;
  const outages: LiftOutage[] = [];
  let updated: string | null = null;
  for (const f of features as Array<{ geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }>) {
    const p = f.properties ?? {};
    const id = typeof p.Kennung === 'string' ? p.Kennung.trim() : '';
    const name = typeof p.Bezeichnung === 'string' ? p.Bezeichnung : '';
    if (!id || !name) continue;
    const coords = Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates as unknown[] : [];
    const [lon, lat] = coords;
    const { unit, station } = splitKvbName(name);
    outages.push({
      id,
      kind,
      station,
      unit,
      lat: typeof lat === 'number' && Number.isFinite(lat) ? lat : null,
      lon: typeof lon === 'number' && Number.isFinite(lon) ? lon : null,
      info: typeof p.Info === 'string' && p.Info.trim() !== '' ? p.Info.trim() : null,
    });
    const ts = typeof p.timestamp === 'string' ? kvbLocalToIso(p.timestamp) : null;
    if (ts && (!updated || ts > updated)) updated = ts;
  }
  return { outages, updated };
}

/** Both lists as one: each unit once (KVB repeats some), lifts first, each kind by station and id. */
export function buildLiftOutages(lists: ReadonlyArray<{ outages: LiftOutage[]; updated: string | null }>): LiftOutageData {
  const seen = new Set<string>();
  const outages: LiftOutage[] = [];
  for (const list of lists) {
    for (const o of list.outages) {
      const key = `${o.kind}:${o.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      outages.push(o);
    }
  }
  const kindOrder = (k: LiftOutage['kind']) => (k === 'lift' ? 0 : 1);
  outages.sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.station.localeCompare(b.station, 'de') || a.id.localeCompare(b.id));
  const updated = lists.map((l) => l.updated).filter((u): u is string => u !== null).sort().at(-1) ?? null;
  return { outages, updated };
}

// --- DB FaSta (lifts and escalators at DB stations) ---

/** FaSta v2 on the DB API Marketplace (OpenAPI 3.0.1 "FaSta - Station Facilities Status"). */
export const DB_FASTA_BASE = 'https://apis.deutschebahn.com/db-api-marketplace/apis/fasta/v2';

/**
 * The DB API Marketplace credentials (subscription to FaSta's free plan), or
 * null when either is missing or blank: the job then skips DB stations.
 */
export function dbFastaCredentials(env: NodeJS.ProcessEnv = process.env): { clientId: string; apiKey: string } | null {
  const clientId = env.DB_API_CLIENT_ID?.trim();
  const apiKey = env.DB_API_KEY?.trim();
  return clientId && apiKey ? { clientId, apiKey } : null;
}

/**
 * The out-of-service units in the city's bounding box: `state=INACTIVE` (not
 * UNKNOWN, which is a unit whose monitoring is down, not one known to be
 * broken). Array parameters are comma-separated (`style: form, explode: false`),
 * the area as west, south, east, north.
 */
export function fastaFacilitiesUrl(box: CityConfig['boundingBox'], base = DB_FASTA_BASE): string {
  const area = [box.west, box.south, box.east, box.north].join(',');
  return `${base}/facilities?type=ELEVATOR,ESCALATOR&state=INACTIVE&area=${area}`;
}

/** A FaSta `facility` as the OpenAPI schema describes it (only `equipmentnumber`, `state`, `stationnumber`, `type` are required). */
interface FastaFacility {
  equipmentnumber?: unknown;
  type?: unknown;
  state?: unknown;
  description?: unknown;
  stateExplanation?: unknown;
  stationnumber?: unknown;
  geocoordX?: unknown;
  geocoordY?: unknown;
  operationalResumeDate?: unknown;
}

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * FaSta's `/facilities` answer as outages: the INACTIVE elevators and escalators,
 * each named after its station (`stationNames`, from `/stations/{n}`; the
 * station number while a name is unknown). Null when the body is not an array.
 * Built from the published OpenAPI spec: not yet checked against live data.
 */
export function parseFastaFacilities(json: unknown, stationNames: ReadonlyMap<number, string>): LiftOutage[] | null {
  if (!Array.isArray(json)) return null;
  const outages: LiftOutage[] = [];
  for (const f of json as FastaFacility[]) {
    const id = finite(f.equipmentnumber);
    const station = finite(f.stationnumber);
    if (id === null || station === null || f.state !== 'INACTIVE') continue;
    const kind = f.type === 'ELEVATOR' ? 'lift' : f.type === 'ESCALATOR' ? 'escalator' : null;
    if (!kind) continue;
    const resume = text(f.operationalResumeDate);
    const explanation = text(f.stateExplanation);
    outages.push({
      id: `db-${id}`,
      kind,
      station: stationNames.get(station) ?? `DB ${station}`,
      unit: text(f.description),
      lat: finite(f.geocoordY),
      lon: finite(f.geocoordX),
      // FaSta's stock texts ("not available") add nothing to "out of service"
      info: explanation && !/^not available$/i.test(explanation) ? explanation : null,
      operator: 'db',
      resumeDate: /^\d{4}-\d{2}-\d{2}$/.test(resume) ? resume : null,
    });
  }
  return outages;
}

/** Station names by FaSta station number, kept for the process: names hardly change. */
const stationNameCache = new Map<number, string>();

function fastaHeaders(creds: { clientId: string; apiKey: string }): Record<string, string> {
  return { 'DB-Client-ID': creds.clientId, 'DB-Api-Key': creds.apiKey, Accept: 'application/json', 'User-Agent': 'CityMonitor/1.0' };
}

/** Looks up the names of stations not yet known (`/stations/{n}`); a failed lookup leaves the number. */
async function resolveStationNames(numbers: Iterable<number>, creds: { clientId: string; apiKey: string }): Promise<void> {
  for (const n of numbers) {
    if (stationNameCache.has(n)) continue;
    try {
      const res = await log.fetch(`${DB_FASTA_BASE}/stations/${n}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: fastaHeaders(creds) });
      if (!res.ok) continue;
      const body = await res.json() as { name?: unknown };
      if (typeof body.name === 'string' && body.name.trim()) stationNameCache.set(n, body.name.trim());
    } catch {
      // the station number stands in until a later run finds the name
    }
  }
}

let warnedNoDbCredentials = false;

async function fetchFastaOutages(city: CityConfig, creds: { clientId: string; apiKey: string }): Promise<LiftOutage[] | null> {
  const res = await log.fetch(fastaFacilitiesUrl(city.boundingBox), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: fastaHeaders(creds) });
  if (!res.ok) {
    log.warn(`${city.id}: DB FaSta returned ${res.status}`);
    return null;
  }
  const json: unknown = await res.json();
  if (!Array.isArray(json)) {
    log.warn(`${city.id}: DB FaSta answer is not a list of facilities`);
    return null;
  }
  const stations = new Set((json as FastaFacility[]).map((f) => finite(f.stationnumber)).filter((n): n is number => n !== null));
  await resolveStationNames(stations, creds);
  return parseFastaFacilities(json, stationNameCache);
}

async function fetchKvbList(cityId: string, url: string, kind: LiftOutage['kind']) {
  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0', Accept: 'application/json' },
  });
  if (!response.ok) {
    log.warn(`${cityId}: KVB ${kind} list returned ${response.status}`);
    return null;
  }
  const parsed = parseKvbList(JSON.parse(decodeKvbBody(await response.arrayBuffer())), kind);
  if (!parsed) log.warn(`${cityId}: KVB ${kind} list is not GeoJSON`);
  return parsed;
}

type OutageList = { outages: LiftOutage[]; updated: string | null };

/** The KVB lists, or null when one failed. */
async function fetchKvbOutages(cityId: string, source: LiftOutageSource): Promise<OutageList[] | null> {
  switch (source.provider) {
    case 'kvb': {
      const lists = await Promise.all(KVB_LISTS.map(([kind, slug]) => fetchKvbList(cityId, `${source.url}/${slug}/json`, kind)));
      return lists.some((l) => l === null) ? null : lists as OutageList[];
    }
  }
}

/**
 * Whether the job fetches anything for the city: KVB's lists, or DB FaSta when
 * its credentials are set (the city feature `stationLifts` follows the config
 * alone, as Geofox's transit does).
 */
export function ingestsLiftOutages(city: CityConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  return city.dataSources.liftOutages !== undefined || (city.dataSources.stationLifts !== undefined && dbFastaCredentials(env) !== null);
}

/**
 * The city's outages from every source it has, or null when one failed: a
 * missing list must not read as "all working".
 */
async function fetchOutages(city: CityConfig, creds: { clientId: string; apiKey: string } | null): Promise<LiftOutageData | null> {
  const lists: OutageList[] = [];
  if (city.dataSources.liftOutages) {
    const kvb = await fetchKvbOutages(city.id, city.dataSources.liftOutages);
    if (!kvb) return null;
    lists.push(...kvb);
  }
  if (city.dataSources.stationLifts && creds) {
    const db = await fetchFastaOutages(city, creds);
    if (!db) return null;
    // FaSta gives no list time
    lists.push({ outages: db, updated: null });
  }
  return buildLiftOutages(lists);
}

export function createLiftOutageIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestLiftOutages(): Promise<void> {
    const creds = dbFastaCredentials();
    for (const city of getActiveCities()) {
      if (city.dataSources.stationLifts && !creds && !warnedNoDbCredentials) {
        warnedNoDbCredentials = true;
        log.info('DB_API_CLIENT_ID or DB_API_KEY not set, skipping DB station lifts (FaSta)');
      }
      if (!ingestsLiftOutages(city)) continue;
      try {
        const data = await fetchOutages(city, creds);
        if (!data) continue;
        cache.set(CK.liftOutages(city.id), data, LIFT_OUTAGES_TTL_SECONDS);
        if (db) {
          try {
            await saveLiftOutages(db, city.id, data);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        const lifts = data.outages.filter((o) => o.kind === 'lift').length;
        if (city.dataSources.stationLifts && creds) log.info(`${city.id}: ${data.outages.filter((o) => o.operator === 'db').length} at DB stations`);
        log.info(`${city.id}: ${lifts} lift(s) and ${data.outages.length - lifts} escalator(s) out of service`);
      } catch (err) {
        log.error(`${city.id} lift outages failed`, err);
      }
    }
  };
}
