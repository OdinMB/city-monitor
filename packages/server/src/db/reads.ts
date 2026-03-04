import { eq, and, desc, asc, max, gte, avg } from 'drizzle-orm';
import type { Db } from './index.js';
import {
  weatherSnapshots,
  transitDisruptions,
  events,
  safetyReports,
  newsItems,
  aiSummaries,
  ninaWarnings,
  geocodeLookups,
  airQualityGrid,
  politicalDistricts,
  waterLevelSnapshots,
  appointmentSnapshots,
  budgetSnapshots,
  constructionSnapshots,
  trafficSnapshots,
  pharmacySnapshots,
  aedSnapshots,
  socialAtlasSnapshots,
  wastewaterSnapshots,
  bathingSnapshots,
  laborMarketSnapshots,
  populationSnapshots,
  feuerwehrSnapshots,
  pollenSnapshots,
  noiseSensorSnapshots,
} from './schema.js';
import type { NinaWarning, PoliticalDistrict, WaterLevelData, BuergeramtData, BudgetSummary, ConstructionSite, TrafficIncident, EmergencyPharmacy, AedLocation, WastewaterSummary, BathingSpot, LaborMarketSummary, PopulationSummary, FeuerwehrSummary, PollenForecast, NoiseSensor, HistoryPoint } from '@city-monitor/shared';
import {
  WeatherDataSchema, WaterLevelDataSchema, BuergeramtDataSchema, BudgetSummarySchema,
  PoliticalDistrictSchema, WastewaterSummarySchema, LaborMarketSummarySchema,
  BathingSpotSchema, AedLocationSchema, EmergencyPharmacySchema,
  TrafficIncidentSchema, ConstructionSiteSchema, PopulationSummarySchema,
  FeuerwehrSummarySchema, PollenForecastSchema, NoiseSensorSchema,
} from '@city-monitor/shared/schemas.js';
import type { GeocodeResult } from '../lib/geocode.js';
import type { WeatherData } from '../cron/ingest-weather.js';
import type { TransitAlert } from '../cron/ingest-transit.js';
import type { CityEvent } from '../cron/ingest-events.js';
import type { SafetyReport } from '../cron/ingest-safety.js';
import type { NewsSummary } from '../cron/summarize.js';
import type { AirQualityGridPoint } from '@city-monitor/shared';
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

export async function loadWeather(db: Db, cityId: string): Promise<DbResult<WeatherData>> {
  const rows = await db
    .select()
    .from(weatherSnapshots)
    .where(eq(weatherSnapshots.cityId, cityId))
    .orderBy(desc(weatherSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  // Safety net: discard data older than 6h (weather cron runs every 30min)
  if (row.fetchedAt && Date.now() - row.fetchedAt.getTime() > 6 * 60 * 60 * 1000) return null;

  const assembled = {
    current: row.current,
    hourly: row.hourly,
    daily: row.daily,
    alerts: (row.alerts ?? []),
  };
  const data = validateJsonb(WeatherDataSchema, assembled, 'weather');
  return data ? { data, fetchedAt: row.fetchedAt } : null;
}

export async function loadTransitAlerts(db: Db, cityId: string): Promise<DbResult<TransitAlert[]>> {
  // Get only the latest batch (rows sharing the MAX fetched_at)
  const latest = await db
    .select({ val: max(transitDisruptions.fetchedAt) })
    .from(transitDisruptions)
    .where(eq(transitDisruptions.cityId, cityId));
  const latestTs = latest[0]?.val;
  if (!latestTs) return null;

  const rows = await db
    .select()
    .from(transitDisruptions)
    .where(and(eq(transitDisruptions.cityId, cityId), eq(transitDisruptions.fetchedAt, latestTs)));

  if (rows.length === 0) return null;

  return {
    data: rows.map((row) => ({
      id: row.externalId ?? String(row.id),
      line: row.line,
      lines: row.line.split(', '),
      type: row.type as TransitAlert['type'],
      severity: row.severity as TransitAlert['severity'],
      message: row.message,
      detail: row.detail ?? row.message,
      station: row.station ?? '',
      location: row.lat != null && row.lon != null ? { lat: row.lat, lon: row.lon } : null,
      affectedStops: (row.affectedStops as string[]) ?? [],
    })),
    fetchedAt: latestTs,
  };
}

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

export async function loadNinaWarnings(db: Db, cityId: string): Promise<DbResult<NinaWarning[]>> {
  // Get only the latest batch (rows sharing the MAX fetched_at)
  const latest = await db
    .select({ val: max(ninaWarnings.fetchedAt) })
    .from(ninaWarnings)
    .where(eq(ninaWarnings.cityId, cityId));
  const latestTs = latest[0]?.val;
  if (!latestTs) return null;

  // Safety net: discard data older than 3h (NINA cron runs every 5min)
  if (Date.now() - latestTs.getTime() > 3 * 60 * 60 * 1000) return null;

  const rows = await db
    .select()
    .from(ninaWarnings)
    .where(and(eq(ninaWarnings.cityId, cityId), eq(ninaWarnings.fetchedAt, latestTs)))
    .orderBy(desc(ninaWarnings.startDate));

  if (rows.length === 0) return null;

  return {
    data: rows.map((row) => ({
      id: row.warningId,
      version: row.version,
      startDate: row.startDate.toISOString(),
      expiresAt: row.expiresAt?.toISOString(),
      severity: row.severity as NinaWarning['severity'],
      urgency: undefined,
      type: 'unknown',
      source: row.source as NinaWarning['source'],
      headline: row.headline,
      description: row.description ?? undefined,
      instruction: row.instruction ?? undefined,
      area: (row.area as NinaWarning['area']) ?? undefined,
    })),
    fetchedAt: latestTs,
  };
}

export async function loadPoliticalDistricts(
  db: Db,
  cityId: string,
  level: string,
): Promise<DbResult<PoliticalDistrict[]>> {
  const rows = await db
    .select()
    .from(politicalDistricts)
    .where(and(
      eq(politicalDistricts.cityId, cityId),
      eq(politicalDistricts.level, level),
    ))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(z.array(PoliticalDistrictSchema), rows[0].districts, 'political');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadPoliticalFetchedAt(
  db: Db,
  cityId: string,
  level: string,
): Promise<Date | null> {
  const rows = await db
    .select({ fetchedAt: politicalDistricts.fetchedAt })
    .from(politicalDistricts)
    .where(and(
      eq(politicalDistricts.cityId, cityId),
      eq(politicalDistricts.level, level),
    ))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].fetchedAt;
}

export async function loadAirQualityGrid(db: Db, cityId: string): Promise<DbResult<AirQualityGridPoint[]>> {
  // Get only the latest batch (rows sharing the MAX fetched_at)
  const latest = await db
    .select({ val: max(airQualityGrid.fetchedAt) })
    .from(airQualityGrid)
    .where(eq(airQualityGrid.cityId, cityId));
  const latestTs = latest[0]?.val;
  if (!latestTs) return null;

  // Safety net: discard data older than 6h (AQ cron runs every 30min)
  if (Date.now() - latestTs.getTime() > 6 * 60 * 60 * 1000) return null;

  const rows = await db
    .select()
    .from(airQualityGrid)
    .where(and(eq(airQualityGrid.cityId, cityId), eq(airQualityGrid.fetchedAt, latestTs)));

  if (rows.length === 0) return null;

  return {
    data: rows.map((row) => ({
      lat: row.lat,
      lon: row.lon,
      europeanAqi: row.europeanAqi,
      station: row.station,
      url: row.url ?? undefined,
    })),
    fetchedAt: latestTs,
  };
}

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

export async function loadWaterLevels(db: Db, cityId: string): Promise<DbResult<WaterLevelData>> {
  const rows = await db
    .select()
    .from(waterLevelSnapshots)
    .where(eq(waterLevelSnapshots.cityId, cityId))
    .orderBy(desc(waterLevelSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  const assembled = {
    stations: row.stations,
    fetchedAt: row.fetchedAt.toISOString(),
  };
  const data = validateJsonb(WaterLevelDataSchema, assembled, 'water-levels');
  return data ? { data, fetchedAt: row.fetchedAt } : null;
}

export async function loadAppointments(db: Db, cityId: string): Promise<DbResult<BuergeramtData>> {
  const rows = await db
    .select()
    .from(appointmentSnapshots)
    .where(eq(appointmentSnapshots.cityId, cityId))
    .orderBy(desc(appointmentSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  const assembled = {
    services: row.services,
    bookingUrl: row.bookingUrl,
    fetchedAt: row.fetchedAt.toISOString(),
  };
  const data = validateJsonb(BuergeramtDataSchema, assembled, 'appointments');
  return data ? { data, fetchedAt: row.fetchedAt } : null;
}

export async function loadBudget(db: Db, cityId: string): Promise<DbResult<BudgetSummary>> {
  const rows = await db
    .select()
    .from(budgetSnapshots)
    .where(eq(budgetSnapshots.cityId, cityId))
    .orderBy(desc(budgetSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(BudgetSummarySchema, rows[0].data, 'budget');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadConstructionSites(db: Db, cityId: string): Promise<DbResult<ConstructionSite[]>> {
  const rows = await db
    .select()
    .from(constructionSnapshots)
    .where(eq(constructionSnapshots.cityId, cityId))
    .orderBy(desc(constructionSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(z.array(ConstructionSiteSchema), rows[0].sites, 'construction');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadTrafficIncidents(db: Db, cityId: string): Promise<DbResult<TrafficIncident[]>> {
  const rows = await db
    .select()
    .from(trafficSnapshots)
    .where(eq(trafficSnapshots.cityId, cityId))
    .orderBy(desc(trafficSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(z.array(TrafficIncidentSchema), rows[0].incidents, 'traffic');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadPharmacies(db: Db, cityId: string): Promise<DbResult<EmergencyPharmacy[]>> {
  const rows = await db
    .select()
    .from(pharmacySnapshots)
    .where(eq(pharmacySnapshots.cityId, cityId))
    .orderBy(desc(pharmacySnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(z.array(EmergencyPharmacySchema), rows[0].pharmacies, 'pharmacies');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadAeds(db: Db, cityId: string): Promise<DbResult<AedLocation[]>> {
  const rows = await db
    .select()
    .from(aedSnapshots)
    .where(eq(aedSnapshots.cityId, cityId))
    .orderBy(desc(aedSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(z.array(AedLocationSchema), rows[0].locations, 'aeds');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadSocialAtlas(db: Db, cityId: string): Promise<DbResult<unknown>> {
  const rows = await db
    .select()
    .from(socialAtlasSnapshots)
    .where(eq(socialAtlasSnapshots.cityId, cityId))
    .orderBy(desc(socialAtlasSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return { data: rows[0].geojson, fetchedAt: rows[0].fetchedAt };
}

export async function loadWastewater(db: Db, cityId: string): Promise<DbResult<WastewaterSummary>> {
  const rows = await db
    .select()
    .from(wastewaterSnapshots)
    .where(eq(wastewaterSnapshots.cityId, cityId))
    .orderBy(desc(wastewaterSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(WastewaterSummarySchema, rows[0].data, 'wastewater');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadBathingSpots(db: Db, cityId: string): Promise<DbResult<BathingSpot[]>> {
  const rows = await db
    .select()
    .from(bathingSnapshots)
    .where(eq(bathingSnapshots.cityId, cityId))
    .orderBy(desc(bathingSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(z.array(BathingSpotSchema), rows[0].spots, 'bathing');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadLaborMarket(db: Db, cityId: string): Promise<DbResult<LaborMarketSummary>> {
  const rows = await db
    .select()
    .from(laborMarketSnapshots)
    .where(eq(laborMarketSnapshots.cityId, cityId))
    .orderBy(desc(laborMarketSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(LaborMarketSummarySchema, rows[0].data, 'labor-market');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadPopulationGeojson(db: Db, cityId: string): Promise<DbResult<unknown>> {
  const rows = await db
    .select()
    .from(populationSnapshots)
    .where(eq(populationSnapshots.cityId, cityId))
    .orderBy(desc(populationSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return { data: rows[0].geojson, fetchedAt: rows[0].fetchedAt };
}

export async function loadPopulationSummary(db: Db, cityId: string): Promise<DbResult<PopulationSummary>> {
  const rows = await db
    .select()
    .from(populationSnapshots)
    .where(eq(populationSnapshots.cityId, cityId))
    .orderBy(desc(populationSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(PopulationSummarySchema, rows[0].summary, 'population');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadFeuerwehr(db: Db, cityId: string): Promise<DbResult<FeuerwehrSummary>> {
  const rows = await db
    .select()
    .from(feuerwehrSnapshots)
    .where(eq(feuerwehrSnapshots.cityId, cityId))
    .orderBy(desc(feuerwehrSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const data = validateJsonb(FeuerwehrSummarySchema, rows[0].data, 'feuerwehr');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadPollen(db: Db, cityId: string): Promise<DbResult<PollenForecast>> {
  const rows = await db
    .select()
    .from(pollenSnapshots)
    .where(eq(pollenSnapshots.cityId, cityId))
    .orderBy(desc(pollenSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  // Safety net: discard data older than 48h (pollen cron runs every 6h, DWD updates daily)
  if (rows[0].fetchedAt && Date.now() - rows[0].fetchedAt.getTime() > 48 * 60 * 60 * 1000) return null;
  const data = validateJsonb(PollenForecastSchema, rows[0].data, 'pollen');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
}

export async function loadNoiseSensors(db: Db, cityId: string): Promise<DbResult<NoiseSensor[]>> {
  const rows = await db
    .select()
    .from(noiseSensorSnapshots)
    .where(eq(noiseSensorSnapshots.cityId, cityId))
    .orderBy(desc(noiseSensorSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  // Discard data older than 2h (cron runs every 10min)
  if (rows[0].fetchedAt && Date.now() - rows[0].fetchedAt.getTime() > 2 * 60 * 60 * 1000) return null;
  const data = validateJsonb(z.array(NoiseSensorSchema), rows[0].data, 'noise-sensors');
  return data ? { data, fetchedAt: rows[0].fetchedAt } : null;
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
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db
    .select({ fetchedAt: weatherSnapshots.fetchedAt, current: weatherSnapshots.current })
    .from(weatherSnapshots)
    .where(and(eq(weatherSnapshots.cityId, cityId), gte(weatherSnapshots.fetchedAt, since)))
    .orderBy(asc(weatherSnapshots.fetchedAt));

  return rows
    .map((r) => {
      const cur = r.current as { temp?: number } | null;
      if (!cur || typeof cur.temp !== 'number') return null;
      return { timestamp: r.fetchedAt.toISOString(), value: cur.temp };
    })
    .filter((p): p is HistoryPoint => p !== null);
}

/**
 * Load AQI history by averaging europeanAqi across grid stations per fetch batch.
 * Returns one point per batch (each cron run = ~30min resolution).
 */
export async function loadAqiHistory(
  db: Db,
  cityId: string,
  sinceDays: number,
): Promise<HistoryPoint[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db
    .select({
      fetchedAt: airQualityGrid.fetchedAt,
      avgAqi: avg(airQualityGrid.europeanAqi),
    })
    .from(airQualityGrid)
    .where(and(eq(airQualityGrid.cityId, cityId), gte(airQualityGrid.fetchedAt, since)))
    .groupBy(airQualityGrid.fetchedAt)
    .orderBy(asc(airQualityGrid.fetchedAt));

  return rows
    .map((r) => {
      const val = r.avgAqi != null ? Number(r.avgAqi) : NaN;
      if (Number.isNaN(val)) return null;
      return { timestamp: r.fetchedAt.toISOString(), value: Math.round(val) };
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
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db
    .select({ fetchedAt: waterLevelSnapshots.fetchedAt, stations: waterLevelSnapshots.stations })
    .from(waterLevelSnapshots)
    .where(and(eq(waterLevelSnapshots.cityId, cityId), gte(waterLevelSnapshots.fetchedAt, since)))
    .orderBy(asc(waterLevelSnapshots.fetchedAt));

  return rows
    .map((r) => {
      const stations = r.stations as Array<{ currentLevel?: number }> | null;
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
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db
    .select({ fetchedAt: laborMarketSnapshots.fetchedAt, data: laborMarketSnapshots.data })
    .from(laborMarketSnapshots)
    .where(and(eq(laborMarketSnapshots.cityId, cityId), gte(laborMarketSnapshots.fetchedAt, since)))
    .orderBy(asc(laborMarketSnapshots.fetchedAt));

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
