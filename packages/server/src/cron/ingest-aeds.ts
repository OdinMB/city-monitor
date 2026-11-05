import type { AedLocation, CityConfig } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveAeds } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger, describeError } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-aeds');

export type { AedLocation };

const FETCH_TIMEOUT_MS = 30_000;
const AED_TTL_SECONDS = 86400; // 24 hours

/**
 * The main Overpass instance first, then a public one run by another operator
 * on the same OSM data. On 2026-11-04 overpass-api.de refused every
 * connection from the server within 40 ms, all day; the second instance keeps
 * the AEDs current when the first turns the server away.
 */
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

interface OverpassNode {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassNode[];
  remark?: string;
}

/** OSM admin_level of a state, where a city-state's boundary is. */
const DEFAULT_ADMIN_LEVEL = 4;

function buildOverpassQuery(cityName: string, adminLevel: number): string {
  return `[out:json][timeout:25];area["name"="${cityName}"]["admin_level"="${adminLevel}"]["boundary"="administrative"]->.s;node["emergency"="defibrillator"](area.s);out body;`;
}

/**
 * Overpass gives each address a couple of query slots and answers 429 (or a
 * 504 under load) when they are taken. With four cities queried back to back
 * at startup, the later ones were turned away and stayed empty until the next
 * daily run, so the cities are spaced out and a busy answer is retried.
 */
const PAUSE_BETWEEN_CITIES_MS = 5_000;
const RETRY_DELAYS_MS = [15_000, 45_000];
const BUSY_STATUSES = new Set([429, 502, 503, 504]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `wait` is for tests, which skip the pauses. */
export function createAedIngestion(cache: Cache, db: Db | null = null, wait: (ms: number) => Promise<void> = sleep) {
  return async function ingestAeds(): Promise<void> {
    const cities = getActiveCities().filter((c) => c.country === 'DE');
    for (const [i, city] of cities.entries()) {
      if (i > 0) await wait(PAUSE_BETWEEN_CITIES_MS);
      try {
        await ingestCityAeds(city, cache, db, wait);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

/**
 * Each instance in turn: the next one is asked when an instance cannot be
 * reached or still answers an error after its retries. The last instance's
 * answer or error is the result.
 */
async function askOverpass(cityId: string, query: string, wait: (ms: number) => Promise<void>): Promise<Response> {
  let lastError: unknown;
  for (const [i, url] of OVERPASS_URLS.entries()) {
    const next = OVERPASS_URLS[i + 1];
    try {
      const response = await askInstance(cityId, url, query, wait);
      if (response.ok || !next) return response;
      log.warn(`${cityId}: ${new URL(url).hostname} answered ${response.status}, asking ${new URL(next).hostname}`);
    } catch (err) {
      lastError = err;
      if (next) log.warn(`${cityId}: ${new URL(url).hostname} failed (${describeError(err)}), asking ${new URL(next).hostname}`);
    }
  }
  throw lastError;
}

async function askInstance(cityId: string, url: string, query: string, wait: (ms: number) => Promise<void>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await log.fetch(url, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const delay = RETRY_DELAYS_MS[attempt];
    if (!BUSY_STATUSES.has(response.status) || delay === undefined) return response;
    log.warn(`${cityId}: Overpass busy (${response.status}), retrying in ${delay / 1000}s`);
    await wait(delay);
  }
}

async function ingestCityAeds(
  city: CityConfig,
  cache: Cache,
  db: Db | null,
  wait: (ms: number) => Promise<void>,
): Promise<void> {
  const cityId = city.id;
  const query = buildOverpassQuery(city.name, city.dataSources.aeds?.adminLevel ?? DEFAULT_ADMIN_LEVEL);

  const response = await askOverpass(cityId, query, wait);

  if (!response.ok) {
    log.warn(`${cityId}: Overpass API returned ${response.status}`);
    return;
  }

  const data = await response.json() as OverpassResponse;

  // Overpass adds a remark only when the query failed part-way (timeout, out
  // of memory, rate limit), so whatever elements came back are incomplete.
  if (data.remark) {
    log.warn(`${cityId}: Overpass query error — ${data.remark}`);
    return;
  }

  const elements = data?.elements ?? [];

  const aeds: AedLocation[] = [];
  for (const el of elements) {
    if (el.lat == null || el.lon == null) continue;
    const tags = el.tags ?? {};

    aeds.push({
      id: `aed-${el.id}`,
      lat: el.lat,
      lon: el.lon,
      indoor: tags.indoor === 'yes',
      description: tags['defibrillator:location'] || undefined,
      operator: tags.operator || undefined,
      openingHours: tags.opening_hours || undefined,
      access: tags.access || undefined,
    });
  }

  cache.set(CK.aedLocations(cityId), aeds, AED_TTL_SECONDS);

  if (db) {
    try {
      await saveAeds(db, cityId, aeds);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${aeds.length} AED locations updated`);
}
