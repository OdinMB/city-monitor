import { sql, type SQL } from 'drizzle-orm';
import type { Db } from './index.js';
import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';
import { loadWeather, loadTransitAlerts, loadEvents, loadSafetyReports, loadNewsItems, loadSummary, loadNinaWarnings, loadAirQualityGrid, loadPoliticalDistricts, loadAllGeocodeLookups, loadWaterLevels, loadAppointments, loadBudget, loadConstructionSites, loadTrafficIncidents, loadPharmacies, loadAeds, loadSocialAtlas, loadWastewater, loadBathingSpots, loadLaborMarket, loadPopulationGeojson, loadPopulationSummary, loadFeuerwehr, loadPollen, loadNoiseSensors, loadCouncilMeetings } from './reads.js';
import { setGeocodeCacheEntry } from '../lib/geocode.js';
import { applyDropLogic, type NewsDigest, type NewsItem } from '../cron/ingest-feeds.js';
import { POPULATION_TTL_SECONDS } from '../cron/ingest-population.js';
import { AQ_GRID_TTL_SECONDS } from '../cron/ingest-air-quality-grid.js';
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
      if (r) cache.set(CK.weather(cityId), r.data, 4320, r.fetchedAt);      // 1h cron + 20%
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
      if (r) cache.set(CK.airQualityGrid(cityId), r.data, AQ_GRID_TTL_SECONDS, r.fetchedAt);   // 30min cron + 20%
    })().catch((err) => log.error(`${cityId} aq grid failed`, err)),

    (async () => {
      const r = await loadWaterLevels(db, cityId);
      if (r) cache.set(CK.waterLevels(cityId), r.data, 1080, r.fetchedAt);  // 15min cron + 20%
    })().catch((err) => log.error(`${cityId} water levels failed`, err)),

    (async () => {
      const r = await loadAppointments(db, cityId);
      if (r) cache.set(CK.appointments(cityId), r.data, 51840, r.fetchedAt);  // 12h cron + 20%
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
        const r = await loadWastewater(db, cityId);
        if (r) cache.set(CK.wastewaterSummary(cityId), r.data, 604800, r.fetchedAt);
      })().catch((err) => log.error(`${cityId} wastewater failed`, err)),

      (async () => {
        const r = await loadBathingSpots(db, cityId);
        if (r) cache.set(CK.bathingSpots(cityId), r.data, 86400, r.fetchedAt);
      })().catch((err) => log.error(`${cityId} bathing failed`, err)),

      (async () => {
        const r = await loadLaborMarket(db, cityId);
        if (r) cache.set(CK.laborMarket(cityId), r.data, 86400, r.fetchedAt);
      })().catch((err) => log.error(`${cityId} labor-market failed`, err)),

      (async () => {
        const r = await loadPopulationGeojson(db, cityId);
        if (r) cache.set(CK.populationGeojson(cityId), r.data, POPULATION_TTL_SECONDS, r.fetchedAt);
      })().catch((err) => log.error(`${cityId} population geojson failed`, err)),

      (async () => {
        const r = await loadPopulationSummary(db, cityId);
        if (r) cache.set(CK.populationSummary(cityId), r.data, POPULATION_TTL_SECONDS, r.fetchedAt);
      })().catch((err) => log.error(`${cityId} population summary failed`, err)),

      (async () => {
        const r = await loadFeuerwehr(db, cityId);
        if (r) cache.set(CK.feuerwehr(cityId), r.data, 86400, r.fetchedAt);
      })().catch((err) => log.error(`${cityId} feuerwehr failed`, err)),

      (async () => {
        const r = await loadNoiseSensors(db, cityId);
        if (r) cache.set(CK.noiseSensors(cityId), r.data, 1200, r.fetchedAt);
      })().catch((err) => log.error(`${cityId} noise-sensors failed`, err)),

      (async () => {
        const r = await loadCouncilMeetings(db, cityId);
        if (r) cache.set(CK.councilMeetings(cityId), r.data, 25920, r.fetchedAt);
      })().catch((err) => log.error(`${cityId} council-meetings failed`, err)),
    ] : []),
  ];

  await Promise.allSettled(tasks);
}

export interface FreshnessSpec {
  jobName: string;
  tableName: string;
  maxAgeSeconds: number;
  /** Override the timestamp column name (default: 'fetched_at') */
  timestampColumn?: string;
  /** Optional column + value filter so the freshness check targets a specific row subset */
  filter?: { column: string; value: string };
  /**
   * Cities that must each have a fresh row: the job is stale when any of them
   * has none. An empty list means the job serves no city, so it is never stale.
   * Omitted, the check is table-wide: the newest row of any city decides.
   */
  cityIds?: string[];
}

type EpochRow = { city_id?: string; epoch?: string | number | null };

/**
 * Check which jobs have stale or missing data in the DB.
 * Queries the latest timestamp of each spec's rows (per city when the spec
 * lists cities) — if missing or older than `maxAgeSeconds`, the job is
 * considered stale and needs a startup run.
 */
export async function findStaleJobs(db: Db, specs: FreshnessSpec[]): Promise<Set<string>> {
  const stale = new Map<string, string[]>(); // job name → cities without fresh rows
  const nowSeconds = Date.now() / 1000;
  const isFresh = (row: EpochRow | undefined, spec: FreshnessSpec) =>
    row?.epoch != null && nowSeconds - Number(row.epoch) <= spec.maxAgeSeconds;

  await Promise.allSettled(specs.map(async (spec) => {
    if (spec.cityIds?.length === 0) return;
    try {
      const result = await db.execute(freshnessQuery(spec));
      const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as EpochRow[];
      if (!spec.cityIds) {
        if (!isFresh(rows[0], spec)) stale.set(spec.jobName, []);
        return;
      }
      const freshCities = new Set(rows.filter((row) => isFresh(row, spec)).map((row) => row.city_id));
      const lacking = spec.cityIds.filter((id) => !freshCities.has(id));
      if (lacking.length > 0) stale.set(spec.jobName, lacking);
    } catch (err) {
      log.error(`${spec.jobName}: freshness check failed`, err);
      stale.set(spec.jobName, []);
    }
  }));

  const fresh = specs.length - stale.size;
  if (stale.size > 0) {
    const listed = [...stale].map(([job, cities]) => (cities.length > 0 ? `${job} (${cities.join(', ')})` : job));
    log.info(`${stale.size} stale, ${fresh} fresh — will refresh: ${listed.join(', ')}`);
  } else {
    log.info(`all ${fresh} domains fresh — no startup ingestion needed`);
  }

  return new Set(stale.keys());
}

/** Newest timestamp per listed city, or the newest of the table when the spec lists none. */
function freshnessQuery(spec: FreshnessSpec): SQL {
  const ts = sql.identifier(spec.timestampColumn ?? 'fetched_at');
  const table = sql.identifier(spec.tableName);
  const conditions: SQL[] = [];
  if (spec.filter) conditions.push(sql`${sql.identifier(spec.filter.column)} = ${spec.filter.value}`);
  if (spec.cityIds) conditions.push(sql`${sql.identifier('city_id')} IN (${sql.join(spec.cityIds.map((id) => sql`${id}`), sql`, `)})`);
  const where = conditions.length > 0 ? sql` WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  return spec.cityIds
    ? sql`SELECT ${sql.identifier('city_id')}, EXTRACT(EPOCH FROM MAX(${ts})) AS epoch FROM ${table}${where} GROUP BY ${sql.identifier('city_id')}`
    : sql`SELECT EXTRACT(EPOCH FROM ${ts}) AS epoch FROM ${table}${where} ORDER BY ${ts} DESC LIMIT 1`;
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
