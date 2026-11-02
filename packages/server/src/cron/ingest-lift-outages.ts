/**
 * Lift and escalator outages at a city's transit stations. Today only KVB
 * Köln publishes them: two GeoJSON lists on its open-data service, updated
 * about every 15 minutes, dl-de/zero-2.0 (open.nrw datasets "Aufzüge KVB
 * Köln" and "Fahrtreppen KVB Köln"). See .context/lift-outages.md.
 */
import type { LiftOutage, LiftOutageData, LiftOutageSource } from '@city-monitor/shared';
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

/** The city's outages, or null when a list failed: a missing list must not read as "all working". */
async function fetchOutages(cityId: string, source: LiftOutageSource): Promise<LiftOutageData | null> {
  switch (source.provider) {
    case 'kvb': {
      const lists = await Promise.all(KVB_LISTS.map(([kind, slug]) => fetchKvbList(cityId, `${source.url}/${slug}/json`, kind)));
      if (lists.some((l) => l === null)) return null;
      return buildLiftOutages(lists as Array<{ outages: LiftOutage[]; updated: string | null }>);
    }
  }
}

export function createLiftOutageIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestLiftOutages(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.liftOutages;
      if (!source) continue;
      try {
        const data = await fetchOutages(city.id, source);
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
        log.info(`${city.id}: ${lifts} lift(s) and ${data.outages.length - lifts} escalator(s) out of service`);
      } catch (err) {
        log.error(`${city.id} lift outages failed`, err);
      }
    }
  };
}
