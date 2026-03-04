import { sql } from 'drizzle-orm';
import type { Db } from './index.js';
import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';
import { loadWeather, loadTransitAlerts, loadEvents, loadSafetyReports, loadNewsItems, loadSummary, loadNinaWarnings, loadAirQualityGrid, loadPoliticalDistricts, loadAllGeocodeLookups, loadWaterLevels, loadAppointments, loadBudget, loadConstructionSites, loadTrafficIncidents, loadPharmacies, loadAeds, loadSocialAtlas, loadWastewater, loadBathingSpots, loadLaborMarket, loadPopulationGeojson, loadPopulationSummary, loadFeuerwehr, loadPollen } from './reads.js';
import { setGeocodeCacheEntry } from '../lib/geocode.js';
import { applyDropLogic, type NewsDigest, type NewsItem } from '../cron/ingest-feeds.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('warm-cache');

export async function warmCache(db: Db, cache: Cache): Promise<void> {
  // Geocode lookups are global — warm before per-city data
  try {
    const lookups = await loadAllGeocodeLookups(db);
    for (const row of lookups) {
      setGeocodeCacheEntry(row.query, { lat: row.lat, lon: row.lon, displayName: row.displayName });
    }
    if (lookups.length > 0) log.info(`warmed ${lookups.length} geocode lookup(s)`);
  } catch (err) {
    log.error('geocode lookups failed', err);
  }

  const cities = getActiveCities();
  log.info(`warming cache for ${cities.length} city(ies)…`);

  await Promise.allSettled(cities.map((city) => warmCity(db, cache, city.id)));

  log.info('done');
}

async function warmCity(db: Db, cache: Cache, cityId: string): Promise<void> {
  const tasks = [
    (async () => {
      const r = await loadWeather(db, cityId);
      if (r) cache.set(CK.weather(cityId), r.data, 2160, r.fetchedAt);      // 30min cron + 20%
    })().catch((err) => log.error(`${cityId} weather failed`, err)),

    (async () => {
      const r = await loadTransitAlerts(db, cityId);
      if (r) cache.set(CK.transitAlerts(cityId), r.data, 1080, r.fetchedAt);  // 15min cron + 20%
    })().catch((err) => log.error(`${cityId} transit failed`, err)),

    (async () => {
      const r = await loadEvents(db, cityId);
      if (r) cache.set(CK.eventsUpcoming(cityId), r.data, 25920, r.fetchedAt);  // 6h cron + 20%
    })().catch((err) => log.error(`${cityId} events failed`, err)),

    (async () => {
      const r = await loadSafetyReports(db, cityId);
      if (r) cache.set(CK.safetyRecent(cityId), r.data, 720, r.fetchedAt);  // 10min cron + 20%
    })().catch((err) => log.error(`${cityId} safety failed`, err)),

    (async () => {
      const r = await loadNewsItems(db, cityId);
      if (r && r.data.length > 0) {
        const digest = buildDigestFromItems(r.data);
        cache.set(CK.newsDigest(cityId), digest, 720, r.fetchedAt);               // 10min cron + 20%
        for (const [cat, catItems] of Object.entries(digest.categories)) {
          cache.set(CK.newsCategory(cityId, cat), catItems, 720, r.fetchedAt);
        }
      }
    })().catch((err) => log.error(`${cityId} news failed`, err)),

    (async () => {
      const r = await loadSummary(db, cityId);
      if (r) cache.set(CK.newsSummary(cityId), r.data, 86400, r.fetchedAt);
    })().catch((err) => log.error(`${cityId} summary failed`, err)),

    (async () => {
      const r = await loadNinaWarnings(db, cityId);
      if (r) cache.set(CK.ninaWarnings(cityId), r.data, 360, r.fetchedAt);  // 5min cron + 20%
    })().catch((err) => log.error(`${cityId} nina failed`, err)),

    (async () => {
      const r = await loadAirQualityGrid(db, cityId);
      if (r) cache.set(CK.airQualityGrid(cityId), r.data, 2160, r.fetchedAt);   // 30min cron + 20%
    })().catch((err) => log.error(`${cityId} aq grid failed`, err)),

    (async () => {
      const r = await loadWaterLevels(db, cityId);
      if (r) cache.set(CK.waterLevels(cityId), r.data, 1080, r.fetchedAt);  // 15min cron + 20%
    })().catch((err) => log.error(`${cityId} water levels failed`, err)),

    (async () => {
      const r = await loadAppointments(db, cityId);
      if (r) cache.set(CK.appointments(cityId), r.data, 25920, r.fetchedAt);  // 6h cron + 20%
    })().catch((err) => log.error(`${cityId} appointments failed`, err)),

    ...(['bezirke', 'bundestag', 'state', 'state-bezirke'] as const).map((level) =>
      (async () => {
        const r = await loadPoliticalDistricts(db, cityId, level);
        if (r) cache.set(CK.political(cityId, level), r.data, 604800, r.fetchedAt);
      })().catch((err) => log.error(`${cityId} political:${level} failed`, err)),
    ),

    (async () => {
      const r = await loadBudget(db, cityId);
      if (r) cache.set(CK.budget(cityId), r.data, 86400, r.fetchedAt);
    })().catch((err) => log.error(`${cityId} budget failed`, err)),

    (async () => {
      const r = await loadConstructionSites(db, cityId);
      if (r) cache.set(CK.constructionSites(cityId), r.data, 2160, r.fetchedAt);   // 30min cron + 20%
    })().catch((err) => log.error(`${cityId} construction failed`, err)),

    (async () => {
      const r = await loadTrafficIncidents(db, cityId);
      if (r) cache.set(CK.trafficIncidents(cityId), r.data, 360, r.fetchedAt);  // 5min cron + 20%
    })().catch((err) => log.error(`${cityId} traffic failed`, err)),

    (async () => {
      const r = await loadPharmacies(db, cityId);
      if (r) cache.set(CK.pharmacies(cityId), r.data, 25920, r.fetchedAt);  // 6h cron + 20%
    })().catch((err) => log.error(`${cityId} pharmacies failed`, err)),

    (async () => {
      const r = await loadAeds(db, cityId);
      if (r) cache.set(CK.aedLocations(cityId), r.data, 86400, r.fetchedAt);
    })().catch((err) => log.error(`${cityId} aeds failed`, err)),

    (async () => {
      const r = await loadSocialAtlas(db, cityId);
      if (r) cache.set(CK.socialAtlasGeojson(cityId), r.data, 604800, r.fetchedAt);
    })().catch((err) => log.error(`${cityId} social-atlas failed`, err)),

    (async () => {
      const r = await loadPollen(db, cityId);
      if (r) cache.set(CK.pollen(cityId), r.data, 86400, r.fetchedAt);
    })().catch((err) => log.error(`${cityId} pollen failed`, err)),

    // Wastewater, bathing, and labor market are Berlin-only data sources
    ...(cityId === 'berlin' ? [
      (async () => {
        const r = await loadWastewater(db, 'berlin');
        if (r) cache.set(CK.wastewaterSummary('berlin'), r.data, 604800, r.fetchedAt);
      })().catch((err) => log.error('wastewater failed', err)),

      (async () => {
        const r = await loadBathingSpots(db, 'berlin');
        if (r) cache.set(CK.bathingSpots('berlin'), r.data, 86400, r.fetchedAt);
      })().catch((err) => log.error('bathing failed', err)),

      (async () => {
        const r = await loadLaborMarket(db, 'berlin');
        if (r) cache.set(CK.laborMarket('berlin'), r.data, 86400, r.fetchedAt);
      })().catch((err) => log.error('labor-market failed', err)),

      (async () => {
        const r = await loadPopulationGeojson(db, 'berlin');
        if (r) cache.set(CK.populationGeojson('berlin'), r.data, 2592000, r.fetchedAt);
      })().catch((err) => log.error('population geojson failed', err)),

      (async () => {
        const r = await loadPopulationSummary(db, 'berlin');
        if (r) cache.set(CK.populationSummary('berlin'), r.data, 2592000, r.fetchedAt);
      })().catch((err) => log.error('population summary failed', err)),

      (async () => {
        const r = await loadFeuerwehr(db, 'berlin');
        if (r) cache.set(CK.feuerwehr('berlin'), r.data, 86400, r.fetchedAt);
      })().catch((err) => log.error('feuerwehr failed', err)),
    ] : []),
  ];

  await Promise.allSettled(tasks);
}

export interface FreshnessSpec {
  jobName: string;
  tableName: string;
  maxAgeSeconds: number;
  /** Optional column + value filter so the freshness check targets a specific row subset */
  filter?: { column: string; value: string };
}

/**
 * Check which jobs have stale or missing data in the DB.
 * Queries the latest `fetched_at` from each table — if missing or older
 * than `maxAgeSeconds`, the job is considered stale and needs a startup run.
 */
export async function findStaleJobs(db: Db, specs: FreshnessSpec[]): Promise<Set<string>> {
  const stale = new Set<string>();
  const now = Date.now();

  await Promise.allSettled(specs.map(async (spec) => {
    try {
      const query = spec.filter
        ? sql`SELECT fetched_at FROM ${sql.identifier(spec.tableName)} WHERE ${sql.identifier(spec.filter.column)} = ${spec.filter.value} ORDER BY fetched_at DESC LIMIT 1`
        : sql`SELECT fetched_at FROM ${sql.identifier(spec.tableName)} ORDER BY fetched_at DESC LIMIT 1`;
      const result = await db.execute(query);
      const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
      const row = rows[0] as { fetched_at?: string | Date } | undefined;
      if (!row || !row.fetched_at) {
        stale.add(spec.jobName);
        return;
      }
      const ageSeconds = (now - new Date(row.fetched_at).getTime()) / 1000;
      if (ageSeconds > spec.maxAgeSeconds) {
        stale.add(spec.jobName);
      }
    } catch {
      stale.add(spec.jobName);
    }
  }));

  const fresh = specs.length - stale.size;
  if (stale.size > 0) {
    log.info(`${stale.size} stale, ${fresh} fresh — will refresh: ${[...stale].join(', ')}`);
  } else {
    log.info(`all ${fresh} domains fresh — no startup ingestion needed`);
  }

  return stale;
}

function buildDigestFromItems(items: import('./writes.js').PersistedNewsItem[]): NewsDigest {
  // Sort by tier (asc), importance (desc), publishedAt (desc) — same as ingest-feeds
  const sorted = [...items].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const aImp = a.assessment?.importance ?? 0;
    const bImp = b.assessment?.importance ?? 0;
    if (aImp !== bImp) return bImp - aImp;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  const filtered = applyDropLogic(sorted);

  const categories: Record<string, NewsItem[]> = {};
  for (const item of filtered) {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category]!.push(item);
  }

  return {
    items: filtered,
    categories,
    updatedAt: new Date().toISOString(),
  };
}
