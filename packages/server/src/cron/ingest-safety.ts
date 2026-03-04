import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveSafetyReports } from '../db/writes.js';
import { loadSafetyReports } from '../db/reads.js';
import { parseFeed } from '../lib/rss-parser.js';
import { hashString } from '../lib/hash.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { geolocateReports } from '../lib/openai.js';

const log = createLogger('ingest-safety');

export interface SafetyReport {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  district?: string;
  location?: { lat: number; lon: number; label?: string };
}

const SAFETY_TIMEOUT_MS = 10_000;

const BERLIN_DISTRICTS = [
  'Mitte', 'Friedrichshain', 'Kreuzberg', 'Pankow', 'Prenzlauer Berg',
  'Charlottenburg', 'Wilmersdorf', 'Spandau', 'Steglitz', 'Zehlendorf',
  'Tempelhof', 'Schöneberg', 'Neukölln', 'Treptow', 'Köpenick',
  'Marzahn', 'Hellersdorf', 'Lichtenberg', 'Reinickendorf', 'Wedding',
  'Moabit', 'Tiergarten',
];

export function createSafetyIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestSafety(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.police) continue;
      try {
        await ingestCitySafety(city.id, city.name, city.dataSources.police.url, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCitySafety(cityId: string, cityName: string, feedUrl: string, cache: Cache, db: Db | null): Promise<void> {
  const response = await log.fetch(feedUrl, {
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
    district: extractDistrict(item.title),
  }));

  // Carry over coordinates from DB for already-geocoded items
  const existingCoords = new Map<string, SafetyReport['location']>();
  if (db) {
    try {
      const existing = await loadSafetyReports(db, cityId);
      if (existing) {
        for (const r of existing) {
          if (r.location) existingCoords.set(r.id, r.location);
        }
      }
    } catch {
      // DB read failed — geocode everything fresh
    }
  }

  for (const report of reports) {
    const stored = existingCoords.get(report.id);
    if (stored) report.location = stored;
  }

  // LLM geolocation only for items without coordinates
  const needsGeo = reports.filter((r) => !r.location);
  if (needsGeo.length > 0) {
    try {
      const geoResults = await geolocateReports(
        cityId,
        cityName,
        needsGeo.map((r) => ({ title: r.title, description: r.description })),
      );
      if (geoResults) {
        for (const geo of geoResults) {
          if (geo.lat != null && geo.lon != null && needsGeo[geo.index]) {
            needsGeo[geo.index].location = { lat: geo.lat, lon: geo.lon, label: geo.locationLabel };
          }
        }
      }
    } catch {
      log.warn(`${cityId} geolocation failed, continuing without`);
    }
  }

  // Sort by most recent first
  reports.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  cache.set(CK.safetyRecent(cityId), reports, 900);

  if (db) {
    try {
      await saveSafetyReports(db, cityId, reports);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${reports.length} reports`);
}

function extractDistrict(title: string): string | undefined {
  for (const district of BERLIN_DISTRICTS) {
    if (title.includes(district)) return district;
  }
  return undefined;
}
