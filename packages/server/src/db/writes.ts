/**
 * DB write functions.
 * All writes INSERT new rows (no delete) to preserve historical data.
 * A daily cleanup cron removes rows older than 7 days.
 * Hash-keyed tables (news, events, safety) use UPSERT to avoid duplicates.
 */

import { sql } from 'drizzle-orm';
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
  councilMeetingSnapshots,
} from './schema.js';
import type { NinaWarning, PoliticalDistrict, WaterLevelData, BuergeramtData, BudgetSummary, ConstructionSite, TrafficIncident, EmergencyPharmacy, AedLocation, WastewaterSummary, BathingSpot, LaborMarketSummary, PopulationSummary, FeuerwehrSummary, PollenForecast, NoiseSensor, CouncilMeeting } from '@city-monitor/shared';
import type { GeocodeResult } from '../lib/geocode.js';
import type { WeatherData } from '../cron/ingest-weather.js';
import type { TransitAlert } from '../cron/ingest-transit.js';
import type { CityEvent } from '../cron/ingest-events.js';
import type { SafetyReport } from '../cron/ingest-safety.js';
import type { NewsItem } from '../cron/ingest-feeds.js';
import type { AirQualityGridPoint } from '@city-monitor/shared';

export interface NewsItemAssessment {
  relevant_to_city?: boolean;
  importance?: number;
  category?: string;
}

export type PersistedNewsItem = NewsItem & { assessment?: NewsItemAssessment };

// ---------------------------------------------------------------------------
// Snapshot tables — INSERT only, no delete
// ---------------------------------------------------------------------------

export async function saveWeather(db: Db, cityId: string, data: WeatherData): Promise<void> {
  await db.insert(weatherSnapshots).values({
    cityId,
    current: data.current,
    hourly: data.hourly,
    daily: data.daily,
    alerts: data.alerts ?? [],
  });
}

export async function saveWaterLevels(db: Db, cityId: string, data: WaterLevelData): Promise<void> {
  await db.insert(waterLevelSnapshots).values({
    cityId,
    stations: data.stations,
  });
}

export async function saveAppointments(db: Db, cityId: string, data: BuergeramtData): Promise<void> {
  await db.insert(appointmentSnapshots).values({
    cityId,
    services: data.services,
    bookingUrl: data.bookingUrl,
  });
}

export async function saveBudget(db: Db, cityId: string, data: BudgetSummary): Promise<void> {
  await db.insert(budgetSnapshots).values({ cityId, data });
}

export async function saveConstructionSites(db: Db, cityId: string, sites: ConstructionSite[]): Promise<void> {
  await db.insert(constructionSnapshots).values({ cityId, sites });
}

export async function saveTrafficIncidents(db: Db, cityId: string, incidents: TrafficIncident[]): Promise<void> {
  await db.insert(trafficSnapshots).values({ cityId, incidents });
}

export async function savePharmacies(db: Db, cityId: string, pharmacies: EmergencyPharmacy[]): Promise<void> {
  await db.insert(pharmacySnapshots).values({ cityId, pharmacies });
}

export async function saveAeds(db: Db, cityId: string, locations: AedLocation[]): Promise<void> {
  await db.insert(aedSnapshots).values({ cityId, locations });
}

export async function saveSocialAtlas(db: Db, cityId: string, geojson: unknown): Promise<void> {
  await db.insert(socialAtlasSnapshots).values({ cityId, geojson });
}

export async function saveWastewater(db: Db, cityId: string, data: WastewaterSummary): Promise<void> {
  await db.insert(wastewaterSnapshots).values({ cityId, data });
}

export async function saveBathingSpots(db: Db, cityId: string, spots: BathingSpot[]): Promise<void> {
  await db.insert(bathingSnapshots).values({ cityId, spots });
}

export async function saveLaborMarket(db: Db, cityId: string, data: LaborMarketSummary): Promise<void> {
  await db.insert(laborMarketSnapshots).values({ cityId, data });
}

export async function savePopulation(db: Db, cityId: string, geojson: unknown, summary: PopulationSummary): Promise<void> {
  await db.insert(populationSnapshots).values({ cityId, geojson, summary });
}

export async function saveFeuerwehr(db: Db, cityId: string, data: FeuerwehrSummary): Promise<void> {
  await db.insert(feuerwehrSnapshots).values({ cityId, data });
}

export async function savePollen(db: Db, cityId: string, data: PollenForecast): Promise<void> {
  await db.insert(pollenSnapshots).values({ cityId, data });
}

export async function saveNoiseSensors(db: Db, cityId: string, data: NoiseSensor[]): Promise<void> {
  await db.insert(noiseSensorSnapshots).values({ cityId, data });
}

export async function saveCouncilMeetings(db: Db, cityId: string, meetings: CouncilMeeting[]): Promise<void> {
  await db.insert(councilMeetingSnapshots).values({ cityId, meetings });
}

// ---------------------------------------------------------------------------
// Multi-row current-state tables — INSERT only, read latest batch
// ---------------------------------------------------------------------------

export async function saveTransitAlerts(db: Db, cityId: string, alerts: TransitAlert[]): Promise<void> {
  if (alerts.length === 0) return;
  await db.insert(transitDisruptions).values(
    alerts.map((a) => ({
      cityId,
      externalId: a.id,
      line: a.line,
      type: a.type,
      severity: a.severity,
      message: a.message,
      detail: a.detail,
      station: a.station,
      lat: a.location?.lat ?? null,
      lon: a.location?.lon ?? null,
      affectedStops: a.affectedStops,
    })),
  );
}

export async function saveNinaWarnings(db: Db, cityId: string, warnings: NinaWarning[]): Promise<void> {
  if (warnings.length === 0) return;
  await db.insert(ninaWarnings).values(
    warnings.map((w) => ({
      cityId,
      warningId: w.id,
      version: w.version,
      source: w.source,
      severity: w.severity,
      headline: w.headline,
      description: w.description ?? null,
      instruction: w.instruction ?? null,
      startDate: new Date(w.startDate),
      expiresAt: w.expiresAt ? new Date(w.expiresAt) : null,
      area: w.area ?? null,
    })),
  ).onConflictDoUpdate({
    target: [ninaWarnings.cityId, ninaWarnings.warningId, ninaWarnings.version],
    set: { fetchedAt: sql`now()` },
  });
}

export async function saveAirQualityGrid(db: Db, cityId: string, points: AirQualityGridPoint[]): Promise<void> {
  if (points.length === 0) return;
  await db.insert(airQualityGrid).values(
    points.map((p) => ({
      cityId,
      lat: p.lat,
      lon: p.lon,
      europeanAqi: p.europeanAqi,
      station: p.station,
      url: p.url ?? null,
    })),
  );
}

export async function saveSummary(
  db: Db,
  cityId: string,
  lang: string,
  summary: { briefing: string; headlineCount: number; headlineHash: string },
  model: string,
  tokens: { input: number; output: number },
  generatedAt?: Date,
): Promise<void> {
  await db.insert(aiSummaries).values({
    cityId,
    lang,
    headlineHash: summary.headlineHash,
    summary: summary.briefing,
    model,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    ...(generatedAt ? { generatedAt } : {}),
  });
}

// ---------------------------------------------------------------------------
// Hash-keyed tables — UPSERT (ON CONFLICT DO UPDATE)
// ---------------------------------------------------------------------------

export async function saveNewsItems(db: Db, cityId: string, items: PersistedNewsItem[]): Promise<void> {
  if (items.length === 0) return;
  await db.insert(newsItems).values(
    items.map((item) => ({
      cityId,
      hash: item.id,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      description: item.description ?? null,
      category: item.category,
      tier: item.tier,
      lang: item.lang,
      relevantToCity: item.assessment?.relevant_to_city ?? null,
      importance: item.assessment?.importance ?? null,
      lat: item.location?.lat ?? null,
      lon: item.location?.lon ?? null,
      locationLabel: item.location?.label ?? null,
    })),
  ).onConflictDoUpdate({
    target: [newsItems.cityId, newsItems.hash],
    set: {
      category: sql`excluded.category`,
      relevantToCity: sql`excluded.relevant_to_city`,
      importance: sql`excluded.importance`,
      lat: sql`excluded.lat`,
      lon: sql`excluded.lon`,
      locationLabel: sql`excluded.location_label`,
      fetchedAt: sql`now()`,
    },
  });
}

export async function saveEvents(db: Db, cityId: string, _source: string, items: CityEvent[]): Promise<void> {
  if (items.length === 0) return;
  // Deduplicate by event id to avoid ON CONFLICT hitting the same row twice
  const unique = [...new Map(items.map((e) => [e.id, e])).values()];
  await db.insert(events).values(
    unique.map((e) => ({
      cityId,
      title: e.title,
      venue: e.venue ?? null,
      date: new Date(e.date),
      endDate: e.endDate ? new Date(e.endDate) : null,
      category: e.category,
      url: e.url,
      description: e.description ?? null,
      free: e.free ?? null,
      hash: e.id,
      source: e.source,
      price: e.price ?? null,
    })),
  ).onConflictDoUpdate({
    target: [events.cityId, events.hash],
    set: {
      date: sql`excluded.date`,
      endDate: sql`excluded.end_date`,
      description: sql`excluded.description`,
      price: sql`excluded.price`,
      fetchedAt: sql`now()`,
    },
  });
}

export async function saveSafetyReports(db: Db, cityId: string, reports: SafetyReport[]): Promise<void> {
  if (reports.length === 0) return;
  await db.insert(safetyReports).values(
    reports.map((r) => ({
      cityId,
      title: r.title,
      description: r.description || null,
      publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
      url: r.url,
      district: r.district ?? null,
      lat: r.location?.lat ?? null,
      lon: r.location?.lon ?? null,
      locationLabel: r.location?.label ?? null,
      hash: r.id,
    })),
  ).onConflictDoUpdate({
    target: [safetyReports.cityId, safetyReports.hash],
    set: {
      description: sql`excluded.description`,
      district: sql`excluded.district`,
      lat: sql`excluded.lat`,
      lon: sql`excluded.lon`,
      locationLabel: sql`excluded.location_label`,
      fetchedAt: sql`now()`,
    },
  });
}

// ---------------------------------------------------------------------------
// Already-upsert tables — no change needed
// ---------------------------------------------------------------------------

export async function savePoliticalDistricts(
  db: Db,
  cityId: string,
  level: string,
  districts: PoliticalDistrict[],
): Promise<void> {
  await db
    .insert(politicalDistricts)
    .values({ cityId, level, districts })
    .onConflictDoUpdate({
      target: [politicalDistricts.cityId, politicalDistricts.level],
      set: { districts, fetchedAt: new Date() },
    });
}

export async function saveGeocodeLookup(
  db: Db,
  query: string,
  result: GeocodeResult,
  provider: string,
): Promise<void> {
  await db
    .insert(geocodeLookups)
    .values({
      query,
      lat: result.lat,
      lon: result.lon,
      displayName: result.displayName,
      provider,
    })
    .onConflictDoNothing({ target: geocodeLookups.query });
}
