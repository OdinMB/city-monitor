import { eq, and, desc, asc, gte } from 'drizzle-orm';
import type { Db } from './index.js';
import {
  snapshots,
  events,
  safetyReports,
  newsItems,
  aiSummaries,
  geocodeLookups,
} from './schema.js';
import type { SnapshotType } from './schema.js';
import type { NinaWarning, PoliticalDistrict, WaterLevelData, BuergeramtData, BudgetSummary, ConstructionSite, TrafficIncident, EmergencyPharmacy, AedLocation, WastewaterSummary, BathingSpot, LaborMarketSummary, PopulationSummary, FeuerwehrSummary, PollenForecast, NoiseSensor, CouncilMeeting, HistoryPoint, AirQualityGridPoint } from '@city-monitor/shared';
import {
  WeatherDataSchema, WaterLevelDataSchema, BuergeramtDataSchema, BudgetSummarySchema,
  PoliticalDistrictSchema, WastewaterSummarySchema, LaborMarketSummarySchema,
  BathingSpotSchema, AedLocationSchema, EmergencyPharmacySchema,
  TrafficIncidentSchema, ConstructionSiteSchema, PopulationSummarySchema,
  FeuerwehrSummarySchema, PollenForecastSchema, NoiseSensorSchema, CouncilMeetingSchema,
  TransitAlertSchema, NinaWarningSchema,
} from '@city-monitor/shared/schemas.js';
import type { GeocodeResult } from '../lib/geocode.js';
import type { WeatherData } from '../cron/ingest-weather.js';
import type { TransitAlert } from '../cron/ingest-transit.js';
import type { CityEvent } from '../cron/ingest-events.js';
import type { SafetyReport } from '../cron/ingest-safety.js';
import type { NewsSummary } from '../cron/summarize.js';
import type { PersistedNewsItem } from './writes.js';
import { createLogger } from '../lib/logger.js';
import { z } from 'zod';

const log = createLogger('reads');

/** Wrapper returned by every route-facing read function. */
export type DbResult<T> = { data: T; fetchedAt: Date } | null;

/** Validate JSONB data with a Zod schema. Returns null on failure. */
function validateJsonb<T>(schema: z.ZodType<T>, data: unknown, label: string): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    log.warn(`${label}: JSONB validation failed — ${result.error.issues[0]?.message}`);
    return null;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Generic snapshot helpers (internal)
// ---------------------------------------------------------------------------

interface SnapshotOpts<T> {
  schema?: z.ZodType<T>;
  maxAgeMs?: number;
}

async function loadSnapshot<T>(
  db: Db,
  cityId: string,
  type: SnapshotType,
  opts?: SnapshotOpts<T>,
): Promise<DbResult<T>> {
  const rows = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.cityId, cityId), eq(snapshots.type, type)))
    .orderBy(desc(snapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];

  if (opts?.maxAgeMs && Date.now() - row.fetchedAt.getTime() > opts.maxAgeMs) return null;

  if (opts?.schema) {
    const data = validateJsonb(opts.schema, row.data, type);
    return data ? { data, fetchedAt: row.fetchedAt } : null;
  }

  return { data: row.data as T, fetchedAt: row.fetchedAt };
}

async function loadSnapshotHistory(
  db: Db,
  cityId: string,
  type: SnapshotType,
  sinceDays: number,
): Promise<Array<{ data: unknown; fetchedAt: Date }>> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  return db
    .select({ data: snapshots.data, fetchedAt: snapshots.fetchedAt })
    .from(snapshots)
    .where(and(
      eq(snapshots.cityId, cityId),
      eq(snapshots.type, type),
      gte(snapshots.fetchedAt, since),
    ))
    .orderBy(asc(snapshots.fetchedAt));
}

// ---------------------------------------------------------------------------
// Named read wrappers — signatures unchanged for callers
// ---------------------------------------------------------------------------

export async function loadWeather(db: Db, cityId: string): Promise<DbResult<WeatherData>> {
  return loadSnapshot(db, cityId, 'open-meteo', { schema: WeatherDataSchema });
}

export async function loadTransitAlerts(db: Db, cityId: string): Promise<DbResult<TransitAlert[]>> {
  return loadSnapshot(db, cityId, 'vbb-disruptions', { schema: z.array(TransitAlertSchema) });
}

export async function loadWaterLevels(db: Db, cityId: string): Promise<DbResult<WaterLevelData>> {
  const result = await loadSnapshot<{ stations: unknown }>(db, cityId, 'pegelonline');
  if (!result) return null;
  const assembled = { stations: result.data.stations, fetchedAt: result.fetchedAt.toISOString() };
  const data = validateJsonb(WaterLevelDataSchema, assembled, 'pegelonline');
  return data ? { data, fetchedAt: result.fetchedAt } : null;
}

export async function loadAppointments(db: Db, cityId: string): Promise<DbResult<BuergeramtData>> {
  const result = await loadSnapshot<{ services: unknown; bookingUrl: string }>(db, cityId, 'service-berlin');
  if (!result) return null;
  const assembled = {
    services: result.data.services,
    bookingUrl: result.data.bookingUrl,
    fetchedAt: result.fetchedAt.toISOString(),
  };
  const data = validateJsonb(BuergeramtDataSchema, assembled, 'service-berlin');
  return data ? { data, fetchedAt: result.fetchedAt } : null;
}

export async function loadBudget(db: Db, cityId: string): Promise<DbResult<BudgetSummary>> {
  return loadSnapshot(db, cityId, 'berlin-haushalt', { schema: BudgetSummarySchema });
}

export async function loadConstructionSites(db: Db, cityId: string): Promise<DbResult<ConstructionSite[]>> {
  return loadSnapshot(db, cityId, 'viz-roadworks', { schema: z.array(ConstructionSiteSchema) });
}

export async function loadTrafficIncidents(db: Db, cityId: string): Promise<DbResult<TrafficIncident[]>> {
  return loadSnapshot(db, cityId, 'tomtom-traffic', { schema: z.array(TrafficIncidentSchema) });
}

export async function loadPharmacies(db: Db, cityId: string): Promise<DbResult<EmergencyPharmacy[]>> {
  return loadSnapshot(db, cityId, 'aponet', { schema: z.array(EmergencyPharmacySchema) });
}

export async function loadAeds(db: Db, cityId: string): Promise<DbResult<AedLocation[]>> {
  return loadSnapshot(db, cityId, 'osm-aeds', { schema: z.array(AedLocationSchema) });
}

export async function loadSocialAtlas(db: Db, cityId: string): Promise<DbResult<unknown>> {
  return loadSnapshot(db, cityId, 'mss-social-atlas');
}

export async function loadWastewater(db: Db, cityId: string): Promise<DbResult<WastewaterSummary>> {
  return loadSnapshot(db, cityId, 'lageso-wastewater', { schema: WastewaterSummarySchema });
}

export async function loadBathingSpots(db: Db, cityId: string): Promise<DbResult<BathingSpot[]>> {
  return loadSnapshot(db, cityId, 'lageso-bathing', { schema: z.array(BathingSpotSchema) });
}

export async function loadLaborMarket(db: Db, cityId: string): Promise<DbResult<LaborMarketSummary>> {
  return loadSnapshot(db, cityId, 'ba-labor-market', { schema: LaborMarketSummarySchema });
}

export async function loadPopulationGeojson(db: Db, cityId: string): Promise<DbResult<unknown>> {
  const result = await loadSnapshot<{ geojson: unknown }>(db, cityId, 'afstat-population');
  if (!result) return null;
  return { data: result.data.geojson, fetchedAt: result.fetchedAt };
}

export async function loadPopulationSummary(db: Db, cityId: string): Promise<DbResult<PopulationSummary>> {
  const result = await loadSnapshot<{ summary: unknown }>(db, cityId, 'afstat-population');
  if (!result) return null;
  const data = validateJsonb(PopulationSummarySchema, result.data.summary, 'afstat-population');
  return data ? { data, fetchedAt: result.fetchedAt } : null;
}

export async function loadFeuerwehr(db: Db, cityId: string): Promise<DbResult<FeuerwehrSummary>> {
  return loadSnapshot(db, cityId, 'bf-feuerwehr', { schema: FeuerwehrSummarySchema });
}

export async function loadPollen(db: Db, cityId: string): Promise<DbResult<PollenForecast>> {
  return loadSnapshot(db, cityId, 'dwd-pollen', { schema: PollenForecastSchema, maxAgeMs: 48 * 3600_000 });
}

export async function loadNoiseSensors(db: Db, cityId: string): Promise<DbResult<NoiseSensor[]>> {
  return loadSnapshot(db, cityId, 'sc-dnms', { schema: z.array(NoiseSensorSchema), maxAgeMs: 2 * 3600_000 });
}

export async function loadCouncilMeetings(db: Db, cityId: string): Promise<DbResult<CouncilMeeting[]>> {
  return loadSnapshot(db, cityId, 'oparl-meetings', { schema: z.array(CouncilMeetingSchema), maxAgeMs: 48 * 3600_000 });
}

export async function loadNinaWarnings(db: Db, cityId: string): Promise<DbResult<NinaWarning[]>> {
  return loadSnapshot(db, cityId, 'bbk-nina', { schema: z.array(NinaWarningSchema), maxAgeMs: 3 * 3600_000 });
}

export async function loadAirQualityGrid(db: Db, cityId: string): Promise<DbResult<AirQualityGridPoint[]>> {
  return loadSnapshot(db, cityId, 'aqi-grid', { schema: z.array(z.object({
    lat: z.number(),
    lon: z.number(),
    europeanAqi: z.number(),
    station: z.string(),
    url: z.string().optional(),
  })), maxAgeMs: 6 * 3600_000 });
}

export async function loadPoliticalDistricts(
  db: Db,
  cityId: string,
  level: string,
): Promise<DbResult<PoliticalDistrict[]>> {
  return loadSnapshot(db, cityId, `abgwatch-${level}` as SnapshotType, { schema: z.array(PoliticalDistrictSchema) });
}

export async function loadPoliticalFetchedAt(
  db: Db,
  cityId: string,
  level: string,
): Promise<Date | null> {
  const rows = await db
    .select({ fetchedAt: snapshots.fetchedAt })
    .from(snapshots)
    .where(and(
      eq(snapshots.cityId, cityId),
      eq(snapshots.type, `abgwatch-${level}`),
    ))
    .orderBy(desc(snapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].fetchedAt;
}

// ---------------------------------------------------------------------------
// Non-snapshot tables (unchanged)
// ---------------------------------------------------------------------------

export async function loadEvents(db: Db, cityId: string): Promise<DbResult<CityEvent[]>> {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.cityId, cityId))
    .orderBy(events.date);

  if (rows.length === 0) return null;

  const newest = rows.reduce((max, r) => r.fetchedAt > max ? r.fetchedAt : max, rows[0]!.fetchedAt);
  // Safety net: discard data older than 48h (events cron runs every 6h)
  if (Date.now() - newest.getTime() > 48 * 60 * 60 * 1000) return null;

  return {
    data: rows.map((row) => ({
      id: row.hash,
      title: row.title,
      venue: row.venue ?? undefined,
      date: row.date.toISOString(),
      endDate: row.endDate?.toISOString(),
      category: (row.category as CityEvent['category']) ?? 'other',
      url: row.url ?? '',
      description: row.description ?? undefined,
      free: row.free ?? undefined,
      source: (row.source as CityEvent['source']) ?? 'kulturdaten',
      price: row.price ?? undefined,
    })),
    fetchedAt: newest,
  };
}

export async function loadSafetyReports(db: Db, cityId: string): Promise<DbResult<SafetyReport[]>> {
  const rows = await db
    .select()
    .from(safetyReports)
    .where(eq(safetyReports.cityId, cityId))
    .orderBy(desc(safetyReports.publishedAt));

  if (rows.length === 0) return null;

  const newest = rows.reduce((max, r) => r.fetchedAt > max ? r.fetchedAt : max, rows[0]!.fetchedAt);
  return {
    data: rows.map((row) => ({
      id: row.hash,
      title: row.title,
      description: row.description ?? '',
      publishedAt: row.publishedAt?.toISOString() ?? '',
      url: row.url ?? '',
      district: row.district ?? undefined,
      location: row.lat != null && row.lon != null
        ? { lat: row.lat, lon: row.lon, label: row.locationLabel ?? undefined }
        : undefined,
    })),
    fetchedAt: newest,
  };
}

export async function loadNewsItems(db: Db, cityId: string): Promise<DbResult<PersistedNewsItem[]>> {
  const rows = await db
    .select()
    .from(newsItems)
    .where(and(
      eq(newsItems.cityId, cityId),
      eq(newsItems.relevantToCity, true),
    ))
    .orderBy(desc(newsItems.publishedAt))
    .limit(200);

  if (rows.length === 0) return null;

  const newest = rows.reduce((max, r) => r.fetchedAt > max ? r.fetchedAt : max, rows[0]!.fetchedAt);
  return {
    data: rows.map((row) => ({
      id: row.hash,
      title: row.title,
      url: row.url,
      publishedAt: row.publishedAt?.toISOString() ?? '',
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      description: row.description ?? undefined,
      category: row.category,
      tier: row.tier,
      lang: row.lang,
      location: row.lat != null && row.lon != null
        ? { lat: row.lat, lon: row.lon, label: row.locationLabel ?? undefined }
        : undefined,
      assessment: row.relevantToCity != null
        ? { relevant_to_city: row.relevantToCity, importance: row.importance ?? undefined, category: row.category }
        : undefined,
    })),
    fetchedAt: newest,
  };
}

/**
 * Load ALL assessed news items (including rejected ones) for the cron prior-assessment map.
 * Unlike loadNewsItems, this does NOT filter out relevant_to_city = false.
 */
export async function loadAllNewsAssessments(db: Db, cityId: string): Promise<PersistedNewsItem[] | null> {
  const rows = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.cityId, cityId))
    .orderBy(desc(newsItems.publishedAt))
    .limit(400);

  if (rows.length === 0) return null;

  return rows.map((row) => ({
    id: row.hash,
    title: row.title,
    url: row.url,
    publishedAt: row.publishedAt?.toISOString() ?? '',
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    description: row.description ?? undefined,
    category: row.category,
    tier: row.tier,
    lang: row.lang,
    location: row.lat != null && row.lon != null
      ? { lat: row.lat, lon: row.lon, label: row.locationLabel ?? undefined }
      : undefined,
    assessment: row.relevantToCity != null
      ? { relevant_to_city: row.relevantToCity, importance: row.importance ?? undefined, category: row.category }
      : undefined,
  }));
}

export async function loadSummary(db: Db, cityId: string): Promise<DbResult<NewsSummary & { headlineHash: string }>> {
  // Load most recent rows — enough to cover all language variants from the latest batch
  const rows = await db
    .select()
    .from(aiSummaries)
    .where(eq(aiSummaries.cityId, cityId))
    .orderBy(desc(aiSummaries.generatedAt))
    .limit(10);

  if (rows.length === 0) return null;

  // Group by the most recent generation timestamp
  const latestTs = rows[0].generatedAt.getTime();
  const latestRows = rows.filter((r) => r.generatedAt.getTime() === latestTs);

  const briefings: Record<string, string> = {};
  for (const row of latestRows) {
    briefings[row.lang] = row.summary;
  }

  return {
    data: {
      briefings,
      generatedAt: rows[0].generatedAt.toISOString(),
      headlineCount: 0,
      cached: true,
      headlineHash: rows[0].headlineHash,
    },
    fetchedAt: rows[0].generatedAt,
  };
}

// ---------------------------------------------------------------------------
// Geocode lookups (unchanged)
// ---------------------------------------------------------------------------

export interface GeocodeLookupRow extends GeocodeResult {
  provider: string;
}

export async function loadGeocodeLookup(db: Db, query: string): Promise<GeocodeLookupRow | null> {
  const rows = await db
    .select()
    .from(geocodeLookups)
    .where(eq(geocodeLookups.query, query))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    lat: row.lat,
    lon: row.lon,
    displayName: row.displayName,
    provider: row.provider,
  };
}

export async function loadAllGeocodeLookups(db: Db): Promise<(GeocodeLookupRow & { query: string })[]> {
  const rows = await db.select().from(geocodeLookups);
  return rows.map((row) => ({
    query: row.query,
    lat: row.lat,
    lon: row.lon,
    displayName: row.displayName,
    provider: row.provider,
  }));
}

/* ── Historical time-series queries ─────────────────────────────── */

/**
 * Load temperature history from weather snapshots.
 * Returns one point per snapshot (each cron run = ~30min resolution).
 */
export async function loadWeatherHistory(
  db: Db,
  cityId: string,
  sinceDays: number,
): Promise<HistoryPoint[]> {
  const rows = await loadSnapshotHistory(db, cityId, 'open-meteo', sinceDays);

  return rows
    .map((r) => {
      const d = r.data as { current?: { temp?: number } } | null;
      const temp = d?.current?.temp;
      if (typeof temp !== 'number') return null;
      return { timestamp: r.fetchedAt.toISOString(), value: temp };
    })
    .filter((p): p is HistoryPoint => p !== null);
}

/**
 * Load AQI history by averaging europeanAqi across grid stations per snapshot.
 * Returns one point per snapshot (each cron run = ~30min resolution).
 */
export async function loadAqiHistory(
  db: Db,
  cityId: string,
  sinceDays: number,
): Promise<HistoryPoint[]> {
  const rows = await loadSnapshotHistory(db, cityId, 'aqi-grid', sinceDays);

  return rows
    .map((r) => {
      const points = r.data as AirQualityGridPoint[] | null;
      if (!Array.isArray(points) || points.length === 0) return null;
      const avg = points.reduce((sum, p) => sum + p.europeanAqi, 0) / points.length;
      return { timestamp: r.fetchedAt.toISOString(), value: Math.round(avg) };
    })
    .filter((p): p is HistoryPoint => p !== null);
}

/**
 * Load water level history for all stations.
 * Returns one point per snapshot with the average level across stations.
 */
export async function loadWaterLevelHistory(
  db: Db,
  cityId: string,
  sinceDays: number,
): Promise<HistoryPoint[]> {
  const rows = await loadSnapshotHistory(db, cityId, 'pegelonline', sinceDays);

  return rows
    .map((r) => {
      const d = r.data as { stations?: Array<{ currentLevel?: number }> } | null;
      const stations = d?.stations;
      if (!Array.isArray(stations) || stations.length === 0) return null;
      const levels = stations.map((s) => s.currentLevel).filter((l): l is number => typeof l === 'number');
      if (levels.length === 0) return null;
      const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
      return { timestamp: r.fetchedAt.toISOString(), value: Math.round(avg) };
    })
    .filter((p): p is HistoryPoint => p !== null);
}

/**
 * Load labor market unemployment rate history.
 * Returns one point per snapshot (monthly resolution).
 */
export async function loadLaborMarketHistory(
  db: Db,
  cityId: string,
  sinceDays: number,
): Promise<HistoryPoint[]> {
  const rows = await loadSnapshotHistory(db, cityId, 'ba-labor-market', sinceDays);

  // Deduplicate by reportMonth — keep latest snapshot per month
  const byMonth = new Map<string, HistoryPoint>();
  for (const r of rows) {
    const d = r.data as { unemploymentRate?: number; reportMonth?: string } | null;
    if (!d || typeof d.unemploymentRate !== 'number') continue;
    const month = d.reportMonth ?? r.fetchedAt.toISOString().slice(0, 7);
    byMonth.set(month, { timestamp: r.fetchedAt.toISOString(), value: d.unemploymentRate });
  }
  return [...byMonth.values()];
}

export type { GeocodeResult };
