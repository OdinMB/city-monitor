import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { CityConfig, TransitAlert } from '@city-monitor/shared';
export type { TransitAlert };
import { saveTransitAlerts } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { hashString } from '../lib/hash.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { classifyDisruption, classifySeverity, extractStops } from '../lib/transit-classify.js';
import {
  DEFAULT_GEOFOX_ENDPOINT, announcementRequestBody, buildStationIndex, geofoxCredentials, geofoxHeaders,
  parseGeofoxAnnouncements, stationListRequestBody, type GeofoxCredentials, type GtiAnnouncementResponse,
  type GtiStationListResponse, type StationIndex,
} from '../lib/geofox.js';

const log = createLogger('ingest-transit');

const TRANSIT_TIMEOUT_MS = 15_000;
/** The whole hvv station list is one large response */
const STATION_LIST_TIMEOUT_MS = 60_000;
/** The station list is fetched at most once a day... */
const STATION_LIST_TTL_S = 86_400;
/** ...and after a failure retried an hour later; meanwhile alerts ingest without locations */
const STATION_LIST_RETRY_S = 3_600;
const DEFAULT_ENDPOINT = 'https://v6.vbb.transport.rest';
const STATION_DELAY_MS = 1_500;

interface VbbDeparture {
  line?: { name?: string; product?: string };
  stop?: { name?: string; location?: { latitude?: number; longitude?: number } };
  remarks?: Array<{ type?: string; summary?: string; text?: string }>;
}

interface VbbResponse {
  departures?: VbbDeparture[];
}

type TransitConfig = NonNullable<CityConfig['dataSources']['transit']>;
type HafasConfig = Extract<TransitConfig, { provider: 'hafas' }>;
type GeofoxConfig = Extract<TransitConfig, { provider: 'geofox' }>;

/**
 * Whether the city's config names a transit source the job can ask: VBB
 * stations, or Geofox. Geofox also needs credentials at run time
 * (ingestsTransit); the city's `transit` feature follows this config check
 * alone, as appointments follows its config without FIRECRAWL_API_KEY.
 */
export function hasTransitSource(city: CityConfig): boolean {
  const transit = city.dataSources.transit;
  if (!transit) return false;
  if (transit.provider === 'geofox') return true;
  return (transit.stations?.length ?? 0) > 0;
}

/** Whether the job fetches for the city now: a transit source, and for Geofox both credentials. */
export function ingestsTransit(city: CityConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!hasTransitSource(city)) return false;
  return city.dataSources.transit?.provider !== 'geofox' || geofoxCredentials(env) !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTransitIngestion(cache: Cache, db: Db | null = null) {
  // Cities already told that their Geofox credentials are missing: said once per process
  const missingCredentialsLogged = new Set<string>();

  return async function ingestTransit(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      const transit = city.dataSources.transit;
      if (!transit || !hasTransitSource(city)) continue;
      try {
        let alerts: TransitAlert[] | null;
        if (transit.provider === 'geofox') {
          if (!ingestsTransit(city)) {
            if (!missingCredentialsLogged.has(city.id)) {
              log.info(`${city.id}: GEOFOX_USER or GEOFOX_PASSWORD not set, skipping Geofox transit`);
              missingCredentialsLogged.add(city.id);
            }
            continue;
          }
          alerts = await fetchGeofoxAlerts(city, transit, cache);
        } else {
          alerts = await fetchHafasAlerts(city.id, transit);
        }
        if (alerts) await storeAlerts(city.id, alerts, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function storeAlerts(cityId: string, alerts: TransitAlert[], cache: Cache, db: Db | null): Promise<void> {
  cache.set(CK.transitAlerts(cityId), alerts, 1200);

  if (db) {
    try {
      await saveTransitAlerts(db, cityId, alerts);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${alerts.length} alerts`);
}

/**
 * Hamburg: one signed getAnnouncements call. Null (no cache write) on any
 * failure, so the last good alerts stay until they go stale. The station list
 * that places the alerts on the map comes from the cache, refetched once a
 * day; without it the alerts still ingest, with no locations.
 */
async function fetchGeofoxAlerts(city: CityConfig, transit: GeofoxConfig, cache: Cache): Promise<TransitAlert[] | null> {
  const cityId = city.id;
  const credentials = geofoxCredentials();
  if (!credentials) return null;
  const endpoint = transit.endpoint ?? DEFAULT_GEOFOX_ENDPOINT;
  // The signature covers these exact bytes, so the same string is signed and sent
  const body = announcementRequestBody();
  const response = await log.fetch(`${endpoint}/gti/public/getAnnouncements`, {
    method: 'POST',
    body,
    headers: geofoxHeaders(body, credentials),
    signal: AbortSignal.timeout(TRANSIT_TIMEOUT_MS),
  });

  const data = (await response.json().catch(() => null)) as GtiAnnouncementResponse | null;
  if (!response.ok || data?.returnCode !== 'OK') {
    // errorDevInfo is GTI's own text ("Authentication failed!"); it never echoes the credentials
    log.warn(`${cityId}: Geofox HTTP ${response.status} ${data?.returnCode ?? ''} ${data?.errorDevInfo ?? ''}`.trim());
    return null;
  }
  const stations = await cache.fetch(
    CK.geofoxStations(cityId), STATION_LIST_TTL_S,
    () => fetchGeofoxStations(cityId, endpoint, credentials), STATION_LIST_RETRY_S,
  );
  return parseGeofoxAnnouncements(data, new Date(), { stations, bounds: city.map.bounds });
}

/** GTI's station list with WGS84 coordinates, indexed; null (retried later) on any failure. */
async function fetchGeofoxStations(
  cityId: string, endpoint: string, credentials: GeofoxCredentials,
): Promise<StationIndex | null> {
  try {
    const body = stationListRequestBody();
    const response = await log.fetch(`${endpoint}/gti/public/listStations`, {
      method: 'POST',
      body,
      headers: geofoxHeaders(body, credentials),
      signal: AbortSignal.timeout(STATION_LIST_TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => null)) as GtiStationListResponse | null;
    if (!response.ok || data?.returnCode !== 'OK') {
      log.warn(`${cityId}: Geofox station list HTTP ${response.status} ${data?.returnCode ?? ''} ${data?.errorDevInfo ?? ''}`.trim());
      return null;
    }
    const index = buildStationIndex(data);
    log.info(`${cityId}: Geofox station list ${data.dataReleaseID ?? ''}, ${index.byId.size} stations with coordinates`);
    return index;
  } catch (err) {
    log.warn(`${cityId}: Geofox station list failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function fetchHafasAlerts(cityId: string, transit: HafasConfig): Promise<TransitAlert[] | null> {
  const endpoint = transit.endpoint ?? DEFAULT_ENDPOINT;
  const stations = transit.stations ?? [];
  if (stations.length === 0) return null;

  // Group alerts by message+station so the same disruption affecting multiple
  // lines (e.g. S41 + S42) becomes a single card with a combined line list.
  const alertMap = new Map<string, TransitAlert>();
  let anySuccess = false;

  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];

    // Delay between stations to avoid overwhelming the API
    if (i > 0) await sleep(STATION_DELAY_MS);

    try {
      const url = `${endpoint}/stops/${station.id}/departures?duration=30&remarks=true&results=20`;
      const response = await log.fetch(url, {
        signal: AbortSignal.timeout(TRANSIT_TIMEOUT_MS),
        headers: { 'User-Agent': 'CityMonitor/1.0' },
      });

      if (!response.ok) continue;

      const data: VbbResponse = await response.json();
      if (!data.departures || data.departures.length === 0) continue;
      anySuccess = true;

      for (const dep of data.departures) {
        if (!dep.line?.name || !dep.remarks) continue;

        for (const remark of dep.remarks) {
          if (remark.type !== 'warning' || !remark.summary) continue;

          const stopName = dep.stop?.name ?? station.name;
          const stopLoc = dep.stop?.location;
          const detail = remark.text?.trim() || remark.summary;
          const dedupeKey = `${remark.summary}:${stopName}`;

          const existing = alertMap.get(dedupeKey);
          if (existing) {
            // Same disruption at same station — add the line if not already listed
            if (!existing.lines.includes(dep.line.name)) {
              existing.lines.push(dep.line.name);
              existing.line = existing.lines.join(', ');
            }
            continue;
          }

          const alert: TransitAlert = {
            id: hashString(dedupeKey),
            line: dep.line.name,
            lines: [dep.line.name],
            type: classifyDisruption(remark.summary),
            severity: classifySeverity(remark.summary),
            message: remark.summary,
            detail,
            station: stopName,
            location: stopLoc?.latitude && stopLoc?.longitude
              ? { lat: stopLoc.latitude, lon: stopLoc.longitude }
              : null,
            affectedStops: extractStops(remark.summary),
          };
          alertMap.set(dedupeKey, alert);
        }
      }
    } catch {
      log.warn(`station ${station.id} failed`);
    }
  }

  if (!anySuccess) {
    log.warn(`${cityId}: all stations failed, skipping cache update`);
    return null;
  }

  return [...alertMap.values()];
}
