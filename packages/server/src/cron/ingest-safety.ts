import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { SafetyReport } from '@city-monitor/shared';
import { saveSafetyReports } from '../db/writes.js';
import { loadSafetyGeoState, type SafetyGeoState } from '../db/reads.js';
import { parseFeed } from '../lib/rss-parser.js';
import { hashString } from '../lib/hash.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { geolocateReports } from '../lib/openai.js';

const log = createLogger('ingest-safety');

export type { SafetyReport };

const SAFETY_TIMEOUT_MS = 10_000;

export function createSafetyIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestSafety(): Promise<void> {
    const eligible = getActiveCities().filter((city) => city.dataSources.police);
    const results = await Promise.allSettled(
      eligible.map((city) =>
        ingestCitySafety(city.id, city.name, city.dataSources.police!, cache, db),
      ),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        log.error(`${eligible[i].id} failed`, r.reason);
      }
    }
  };
}

async function ingestCitySafety(cityId: string, cityName: string, policeConfig: { url: string; districts?: string[] }, cache: Cache, db: Db | null): Promise<void> {
  const response = await log.fetch(policeConfig.url, {
    signal: AbortSignal.timeout(SAFETY_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return;

  const xml = await response.text();
  const items = parseFeed(xml);

  const reports: SafetyReport[] = items.map((item) => ({
    id: hashString(item.url + item.title),
    title: item.title,
    description: item.description || '',
    publishedAt: item.publishedAt,
    url: item.url,
    district: extractDistrict(item.title, policeConfig.districts),
  }));

  // Carry over coordinates and the attempted marker from DB
  let stored: SafetyGeoState = { coords: new Map(), attempted: new Set() };
  if (db) {
    try {
      stored = await loadSafetyGeoState(db, cityId, reports.map((r) => r.id));
    } catch {
      // DB read failed — geocode everything fresh
    }
  }

  for (const report of reports) {
    const location = stored.coords.get(report.id);
    if (location) report.location = location;
  }

  const geoAttempted = await geolocateNewReports(cityId, cityName, reports, stored.attempted);

  // Sort by most recent first
  reports.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  cache.set(CK.safetyRecent(cityId), reports, 900);

  if (db) {
    try {
      await saveSafetyReports(db, cityId, reports, geoAttempted);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${reports.length} reports`);
}

/**
 * Ask the LLM for locations of reports that have no coordinates and were never
 * attempted, and set `location` on the ones it places. Returns the updated
 * attempted set: after a successful call, every report sent that still has no
 * coordinates is final (no label, left out, or the label did not geocode).
 * A failed or rejected call marks nothing, so those reports are retried.
 */
async function geolocateNewReports(
  cityId: string,
  cityName: string,
  reports: SafetyReport[],
  previouslyAttempted: ReadonlySet<string>,
): Promise<Set<string>> {
  const attempted = new Set(previouslyAttempted);
  const needsGeo = reports.filter((r) => !r.location && !attempted.has(r.id));
  if (needsGeo.length === 0) return attempted;

  try {
    const geoResults = await geolocateReports(
      cityId,
      cityName,
      needsGeo.map((r) => ({ title: r.title, description: r.description })),
    );
    if (!geoResults) return attempted;

    for (const geo of geoResults) {
      if (geo.lat != null && geo.lon != null && needsGeo[geo.index]) {
        needsGeo[geo.index].location = { lat: geo.lat, lon: geo.lon, label: geo.locationLabel };
      }
    }
    for (const report of needsGeo) {
      if (!report.location) attempted.add(report.id);
    }
  } catch {
    log.warn(`${cityId} geolocation failed, continuing without`);
  }
  return attempted;
}

function extractDistrict(title: string, districts?: string[]): string | undefined {
  if (!districts) return undefined;
  for (const district of districts) {
    if (title.includes(district)) return district;
  }
  return undefined;
}
