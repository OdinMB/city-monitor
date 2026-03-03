/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { eq, and } from 'drizzle-orm';
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
import type { NewsItem } from '../cron/ingest-feeds.js';
import type { AirQualityGridPoint } from '@city-monitor/shared';

export interface NewsItemAssessment {
  relevant_to_city?: boolean;
  importance?: number;
  category?: string;
}

export type PersistedNewsItem = NewsItem & { assessment?: NewsItemAssessment };

export async function saveWeather(db: Db, cityId: string, data: WeatherData): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(weatherSnapshots).where(eq(weatherSnapshots.cityId, cityId));
    await tx.insert(weatherSnapshots).values({
      cityId,
      current: data.current,
      hourly: data.hourly,
      daily: data.daily,
      alerts: data.alerts ?? [],
    });
  });
}

export async function saveTransitAlerts(db: Db, cityId: string, alerts: TransitAlert[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(transitDisruptions).where(eq(transitDisruptions.cityId, cityId));
    if (alerts.length === 0) return;
    await tx.insert(transitDisruptions).values(
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
  });
}

export async function saveEvents(db: Db, cityId: string, source: string, items: CityEvent[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(events).where(and(eq(events.cityId, cityId), eq(events.source, source)));
    if (items.length === 0) return;
    await tx.insert(events).values(
      items.map((e) => ({
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
    );
  });
}

export async function saveSafetyReports(db: Db, cityId: string, reports: SafetyReport[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(safetyReports).where(eq(safetyReports.cityId, cityId));
    if (reports.length === 0) return;
    await tx.insert(safetyReports).values(
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
    );
  });
}

export async function saveNewsItems(db: Db, cityId: string, items: PersistedNewsItem[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(newsItems).where(eq(newsItems.cityId, cityId));
    if (items.length === 0) return;
    await tx.insert(newsItems).values(
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
    );
  });
}

export async function saveSummary(
  db: Db,
  cityId: string,
  summary: { briefing: string; headlineCount: number; headlineHash: string },
  model: string,
  tokens: { input: number; output: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(aiSummaries).where(eq(aiSummaries.cityId, cityId));
    await tx.insert(aiSummaries).values({
      cityId,
      headlineHash: summary.headlineHash,
      summary: summary.briefing,
      model,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
    });
  });
}

export async function saveNinaWarnings(db: Db, cityId: string, warnings: NinaWarning[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(ninaWarnings).where(eq(ninaWarnings.cityId, cityId));
    if (warnings.length === 0) return;
    await tx.insert(ninaWarnings).values(
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
    );
  });
}

export async function saveAirQualityGrid(db: Db, cityId: string, points: AirQualityGridPoint[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(airQualityGrid).where(eq(airQualityGrid.cityId, cityId));
    if (points.length === 0) return;
    await tx.insert(airQualityGrid).values(
      points.map((p) => ({
        cityId,
        lat: p.lat,
        lon: p.lon,
        europeanAqi: p.europeanAqi,
        station: p.station,
        url: p.url ?? null,
      })),
    );
  });
}

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

export async function saveWaterLevels(db: Db, cityId: string, data: WaterLevelData): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(waterLevelSnapshots).where(eq(waterLevelSnapshots.cityId, cityId));
    await tx.insert(waterLevelSnapshots).values({
      cityId,
      stations: data.stations,
    });
  });
}

export async function saveAppointments(db: Db, cityId: string, data: BuergeramtData): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(appointmentSnapshots).where(eq(appointmentSnapshots.cityId, cityId));
    await tx.insert(appointmentSnapshots).values({
      cityId,
      services: data.services,
      bookingUrl: data.bookingUrl,
    });
  });
}

export async function saveBudget(db: Db, cityId: string, data: BudgetSummary): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(budgetSnapshots).where(eq(budgetSnapshots.cityId, cityId));
    await tx.insert(budgetSnapshots).values({ cityId, data });
  });
}

export async function saveConstructionSites(db: Db, cityId: string, sites: ConstructionSite[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(constructionSnapshots).where(eq(constructionSnapshots.cityId, cityId));
    await tx.insert(constructionSnapshots).values({ cityId, sites });
  });
}

export async function saveTrafficIncidents(db: Db, cityId: string, incidents: TrafficIncident[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(trafficSnapshots).where(eq(trafficSnapshots.cityId, cityId));
    await tx.insert(trafficSnapshots).values({ cityId, incidents });
  });
}

export async function savePharmacies(db: Db, cityId: string, pharmacies: EmergencyPharmacy[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(pharmacySnapshots).where(eq(pharmacySnapshots.cityId, cityId));
    await tx.insert(pharmacySnapshots).values({ cityId, pharmacies });
  });
}

export async function saveAeds(db: Db, cityId: string, locations: AedLocation[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(aedSnapshots).where(eq(aedSnapshots.cityId, cityId));
    await tx.insert(aedSnapshots).values({ cityId, locations });
  });
}

export async function saveSocialAtlas(db: Db, cityId: string, geojson: unknown): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(socialAtlasSnapshots).where(eq(socialAtlasSnapshots.cityId, cityId));
    await tx.insert(socialAtlasSnapshots).values({ cityId, geojson });
  });
}

export async function saveWastewater(db: Db, cityId: string, data: WastewaterSummary): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(wastewaterSnapshots).where(eq(wastewaterSnapshots.cityId, cityId));
    await tx.insert(wastewaterSnapshots).values({ cityId, data });
  });
}

export async function saveBathingSpots(db: Db, cityId: string, spots: BathingSpot[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(bathingSnapshots).where(eq(bathingSnapshots.cityId, cityId));
    await tx.insert(bathingSnapshots).values({ cityId, spots });
  });
}

export async function saveLaborMarket(db: Db, cityId: string, data: LaborMarketSummary): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(laborMarketSnapshots).where(eq(laborMarketSnapshots.cityId, cityId));
    await tx.insert(laborMarketSnapshots).values({ cityId, data });
  });
}
