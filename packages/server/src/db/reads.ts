/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { eq, and, or, isNull, desc, max } from 'drizzle-orm';
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
} from './schema.js';
import type { NinaWarning, PoliticalDistrict, WaterLevelData, BuergeramtData, BudgetSummary, ConstructionSite, TrafficIncident, EmergencyPharmacy, AedLocation, WastewaterSummary, BathingSpot, LaborMarketSummary } from '@city-monitor/shared';
import type { GeocodeResult } from '../lib/geocode.js';
import type { WeatherData } from '../cron/ingest-weather.js';
import type { TransitAlert } from '../cron/ingest-transit.js';
import type { CityEvent } from '../cron/ingest-events.js';
import type { SafetyReport } from '../cron/ingest-safety.js';
import type { NewsSummary } from '../cron/summarize.js';
import type { AirQualityGridPoint } from '@city-monitor/shared';
import type { PersistedNewsItem } from './writes.js';

export async function loadWeather(db: Db, cityId: string): Promise<WeatherData | null> {
  const rows = await db
    .select()
    .from(weatherSnapshots)
    .where(eq(weatherSnapshots.cityId, cityId))
    .orderBy(desc(weatherSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    current: row.current,
    hourly: row.hourly,
    daily: row.daily,
    alerts: (row.alerts as WeatherData['alerts']) ?? [],
  } as WeatherData;
}

export async function loadTransitAlerts(db: Db, cityId: string): Promise<TransitAlert[] | null> {
  // Get only the latest batch (rows sharing the MAX fetched_at)
  const latest = await db
    .select({ val: max(transitDisruptions.fetchedAt) })
    .from(transitDisruptions)
    .where(eq(transitDisruptions.cityId, cityId));
  const latestTs = latest[0]?.val;
  if (!latestTs) return null;

  // Guard against stale data: if the latest batch is too old, treat as empty
  if (Date.now() - latestTs.getTime() > 30 * 60 * 1000) return null;

  const rows = await db
    .select()
    .from(transitDisruptions)
    .where(and(eq(transitDisruptions.cityId, cityId), eq(transitDisruptions.fetchedAt, latestTs)));

  if (rows.length === 0) return null;

  return rows.map((row) => ({
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
  }));
}

export async function loadEvents(db: Db, cityId: string): Promise<CityEvent[] | null> {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.cityId, cityId))
    .orderBy(events.date);

  if (rows.length === 0) return null;

  return rows.map((row) => ({
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
  }));
}

export async function loadSafetyReports(db: Db, cityId: string): Promise<SafetyReport[] | null> {
  const rows = await db
    .select()
    .from(safetyReports)
    .where(eq(safetyReports.cityId, cityId))
    .orderBy(desc(safetyReports.publishedAt));

  if (rows.length === 0) return null;

  return rows.map((row) => ({
    id: row.hash,
    title: row.title,
    description: row.description ?? '',
    publishedAt: row.publishedAt?.toISOString() ?? '',
    url: row.url ?? '',
    district: row.district ?? undefined,
    location: row.lat != null && row.lon != null
      ? { lat: row.lat, lon: row.lon, label: row.locationLabel ?? undefined }
      : undefined,
  }));
}

export async function loadNewsItems(db: Db, cityId: string): Promise<PersistedNewsItem[] | null> {
  const rows = await db
    .select()
    .from(newsItems)
    .where(and(
      eq(newsItems.cityId, cityId),
      or(isNull(newsItems.relevantToCity), eq(newsItems.relevantToCity, true)),
    ))
    .orderBy(desc(newsItems.publishedAt))
    .limit(200);

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

export async function loadSummary(db: Db, cityId: string): Promise<(NewsSummary & { headlineHash: string }) | null> {
  const rows = await db
    .select()
    .from(aiSummaries)
    .where(eq(aiSummaries.cityId, cityId))
    .orderBy(desc(aiSummaries.generatedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    briefing: row.summary,
    generatedAt: row.generatedAt.toISOString(),
    headlineCount: 0, // Not stored in DB; informational only
    cached: true,
    headlineHash: row.headlineHash,
  };
}

export async function loadNinaWarnings(db: Db, cityId: string): Promise<NinaWarning[] | null> {
  // Get only the latest batch (rows sharing the MAX fetched_at)
  const latest = await db
    .select({ val: max(ninaWarnings.fetchedAt) })
    .from(ninaWarnings)
    .where(eq(ninaWarnings.cityId, cityId));
  const latestTs = latest[0]?.val;
  if (!latestTs) return null;

  // Guard against stale data: if the latest batch is too old, treat as empty
  if (Date.now() - latestTs.getTime() > 60 * 60 * 1000) return null;

  const rows = await db
    .select()
    .from(ninaWarnings)
    .where(and(eq(ninaWarnings.cityId, cityId), eq(ninaWarnings.fetchedAt, latestTs)))
    .orderBy(desc(ninaWarnings.startDate));

  if (rows.length === 0) return null;

  return rows.map((row) => ({
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
  }));
}

export async function loadPoliticalDistricts(
  db: Db,
  cityId: string,
  level: string,
): Promise<PoliticalDistrict[] | null> {
  const rows = await db
    .select()
    .from(politicalDistricts)
    .where(and(
      eq(politicalDistricts.cityId, cityId),
      eq(politicalDistricts.level, level),
    ))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].districts as PoliticalDistrict[];
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

export async function loadAirQualityGrid(db: Db, cityId: string): Promise<AirQualityGridPoint[] | null> {
  // Get only the latest batch (rows sharing the MAX fetched_at)
  const latest = await db
    .select({ val: max(airQualityGrid.fetchedAt) })
    .from(airQualityGrid)
    .where(eq(airQualityGrid.cityId, cityId));
  const latestTs = latest[0]?.val;
  if (!latestTs) return null;

  // Guard against stale data: if the latest batch is too old, treat as empty
  if (Date.now() - latestTs.getTime() > 60 * 60 * 1000) return null;

  const rows = await db
    .select()
    .from(airQualityGrid)
    .where(and(eq(airQualityGrid.cityId, cityId), eq(airQualityGrid.fetchedAt, latestTs)));

  if (rows.length === 0) return null;

  return rows.map((row) => ({
    lat: row.lat,
    lon: row.lon,
    europeanAqi: row.europeanAqi,
    station: row.station,
    url: row.url ?? undefined,
  }));
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

export async function loadWaterLevels(db: Db, cityId: string): Promise<WaterLevelData | null> {
  const rows = await db
    .select()
    .from(waterLevelSnapshots)
    .where(eq(waterLevelSnapshots.cityId, cityId))
    .orderBy(desc(waterLevelSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    stations: row.stations as WaterLevelData['stations'],
    fetchedAt: row.fetchedAt.toISOString(),
  };
}

export async function loadAppointments(db: Db, cityId: string): Promise<BuergeramtData | null> {
  const rows = await db
    .select()
    .from(appointmentSnapshots)
    .where(eq(appointmentSnapshots.cityId, cityId))
    .orderBy(desc(appointmentSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    services: row.services as BuergeramtData['services'],
    bookingUrl: row.bookingUrl,
    fetchedAt: row.fetchedAt.toISOString(),
  };
}

export async function loadBudget(db: Db, cityId: string): Promise<BudgetSummary | null> {
  const rows = await db
    .select()
    .from(budgetSnapshots)
    .where(eq(budgetSnapshots.cityId, cityId))
    .orderBy(desc(budgetSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].data as BudgetSummary;
}

export async function loadConstructionSites(db: Db, cityId: string): Promise<ConstructionSite[] | null> {
  const rows = await db
    .select()
    .from(constructionSnapshots)
    .where(eq(constructionSnapshots.cityId, cityId))
    .orderBy(desc(constructionSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].sites as ConstructionSite[];
}

export async function loadTrafficIncidents(db: Db, cityId: string): Promise<TrafficIncident[] | null> {
  const rows = await db
    .select()
    .from(trafficSnapshots)
    .where(eq(trafficSnapshots.cityId, cityId))
    .orderBy(desc(trafficSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].incidents as TrafficIncident[];
}

export async function loadPharmacies(db: Db, cityId: string): Promise<EmergencyPharmacy[] | null> {
  const rows = await db
    .select()
    .from(pharmacySnapshots)
    .where(eq(pharmacySnapshots.cityId, cityId))
    .orderBy(desc(pharmacySnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].pharmacies as EmergencyPharmacy[];
}

export async function loadAeds(db: Db, cityId: string): Promise<AedLocation[] | null> {
  const rows = await db
    .select()
    .from(aedSnapshots)
    .where(eq(aedSnapshots.cityId, cityId))
    .orderBy(desc(aedSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].locations as AedLocation[];
}

export async function loadSocialAtlas(db: Db, cityId: string): Promise<unknown | null> {
  const rows = await db
    .select()
    .from(socialAtlasSnapshots)
    .where(eq(socialAtlasSnapshots.cityId, cityId))
    .orderBy(desc(socialAtlasSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].geojson;
}

export async function loadWastewater(db: Db, cityId: string): Promise<WastewaterSummary | null> {
  const rows = await db
    .select()
    .from(wastewaterSnapshots)
    .where(eq(wastewaterSnapshots.cityId, cityId))
    .orderBy(desc(wastewaterSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].data as WastewaterSummary;
}

export async function loadBathingSpots(db: Db, cityId: string): Promise<BathingSpot[] | null> {
  const rows = await db
    .select()
    .from(bathingSnapshots)
    .where(eq(bathingSnapshots.cityId, cityId))
    .orderBy(desc(bathingSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].spots as BathingSpot[];
}

export async function loadLaborMarket(db: Db, cityId: string): Promise<LaborMarketSummary | null> {
  const rows = await db
    .select()
    .from(laborMarketSnapshots)
    .where(eq(laborMarketSnapshots.cityId, cityId))
    .orderBy(desc(laborMarketSnapshots.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].data as LaborMarketSummary;
}

export type { GeocodeResult };
