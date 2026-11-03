/**
 * Bike-sharing stations with the bikes available now, per city from
 * `dataSources.bikeSharing`: nextbike's GBFS feeds (CC0-1.0, stated in each
 * feed's system_information) for Berlin, KVB-Rad Köln and MyRadl München, and
 * Hamburg's StadtRAD from the Urban Data Platform's SensorThings API
 * (dl-de/by-2.0). Stations only; free-floating bikes are left out. See
 * .context/bike-sharing.md.
 */
import type { BikeSharingData, BikeSharingSource, CityConfig } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveBikeSharing } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { gbfsFeedUrls, parseGbfsStations, parseStadtradThings, stadtradThingsUrl } from '../lib/bike-sharing-parsers.js';

const log = createLogger('ingest-bike-sharing');

const FETCH_TIMEOUT_MS = 20_000;
/** Two job runs (every 5 min): a missed run keeps the counts, a second lets them lapse to the DB fallback. */
export const BIKE_SHARING_TTL_SECONDS = 600;
/**
 * Postgres gets a snapshot at most this often per city. The counts change by
 * the minute, but a row only serves cache warming and the route's fallback,
 * and Berlin's is about 150 KB: a row every 5 minutes would add ~40 MB a day.
 */
export const BIKE_SHARING_DB_INTERVAL_MS = 30 * 60_000;
/** The StadtRAD query fits in one page today (365 things); a few more pages are followed if it grows. */
const MAX_STA_PAGES = 5;

async function getJson(cityId: string, url: string): Promise<unknown | null> {
  const res = await log.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)', Accept: 'application/json' },
  });
  if (!res.ok) {
    log.warn(`${cityId}: ${new URL(url).hostname} returned ${res.status}`);
    return null;
  }
  return res.json();
}

async function fetchGbfs(city: CityConfig, source: Extract<BikeSharingSource, { provider: 'gbfs' }>): Promise<BikeSharingData | null> {
  const discovery = await getJson(city.id, source.url);
  if (discovery === null) return null;
  const urls = gbfsFeedUrls(discovery);
  if (!urls) {
    log.warn(`${city.id}: GBFS discovery lists no station feeds`);
    return null;
  }
  const [info, status] = await Promise.all([getJson(city.id, urls.info), getJson(city.id, urls.status)]);
  if (info === null || status === null) return null;
  const parsed = parseGbfsStations(info, status, city.boundingBox);
  if (!parsed) {
    log.warn(`${city.id}: GBFS station feeds are not GBFS`);
    return null;
  }
  return { system: source.system, operator: source.operator, stations: parsed.stations, updated: parsed.updated };
}

async function fetchStadtrad(city: CityConfig, source: Extract<BikeSharingSource, { provider: 'hamburg-sta' }>): Promise<BikeSharingData | null> {
  const now = Date.now();
  const stations: BikeSharingData['stations'] = [];
  let newest: number | null = null;
  let url: string | null = stadtradThingsUrl(source.url);
  for (let page = 0; url && page < MAX_STA_PAGES; page++) {
    const json = await getJson(city.id, url);
    if (json === null) return null;
    const parsed = parseStadtradThings(json, city.boundingBox, now);
    if (!parsed) {
      log.warn(`${city.id}: StadtRAD answer is not a SensorThings collection`);
      return null;
    }
    stations.push(...parsed.stations);
    if (parsed.newest !== null && (newest === null || parsed.newest > newest)) newest = parsed.newest;
    const next = (json as { '@iot.nextLink'?: unknown })['@iot.nextLink'];
    url = typeof next === 'string' ? next : null;
  }
  return {
    system: source.system,
    operator: source.operator,
    stations,
    updated: newest === null ? null : new Date(newest).toISOString(),
  };
}

function fetchSystem(city: CityConfig, source: BikeSharingSource): Promise<BikeSharingData | null> {
  switch (source.provider) {
    case 'gbfs': return fetchGbfs(city, source);
    case 'hamburg-sta': return fetchStadtrad(city, source);
  }
}

/** `now` is for tests, which step through the DB write interval. */
export function createBikeSharingIngestion(cache: Cache, db: Db | null = null, now: () => number = Date.now) {
  const lastSaved = new Map<string, number>();
  return async function ingestBikeSharing(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.bikeSharing;
      if (!source) continue;
      try {
        const data = await fetchSystem(city, source);
        if (!data) continue;
        if (data.stations.length === 0) {
          // An empty list is a broken feed, not a city without bikes: keep the last one
          log.warn(`${city.id}: ${source.system} has no stations in the city`);
          continue;
        }
        cache.set(CK.bikeSharing(city.id), data, BIKE_SHARING_TTL_SECONDS);
        const t = now();
        if (db && t - (lastSaved.get(city.id) ?? -Infinity) >= BIKE_SHARING_DB_INTERVAL_MS) {
          try {
            await saveBikeSharing(db, city.id, data);
            lastSaved.set(city.id, t);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        const bikes = data.stations.reduce((sum, s) => sum + s.bikes, 0);
        log.info(`${city.id}: ${data.stations.length} ${source.system} stations, ${bikes} bikes`);
      } catch (err) {
        log.error(`${city.id} bike sharing failed`, err);
      }
    }
  };
}
