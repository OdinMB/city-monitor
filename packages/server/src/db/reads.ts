/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { eq, desc } from 'drizzle-orm';
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
} from './schema.js';
import type { NinaWarning } from '@city-monitor/shared';
import type { GeocodeResult } from '../lib/geocode.js';
import type { WeatherData } from '../cron/ingest-weather.js';
import type { TransitAlert } from '../cron/ingest-transit.js';
import type { CityEvent } from '../cron/ingest-events.js';
import type { SafetyReport } from '../cron/ingest-safety.js';
import type { NewsItem } from '../cron/ingest-feeds.js';
import type { NewsSummary } from '../cron/summarize.js';
import type { PersistedNewsItem } from './writes.js';

export async function loadWeather(db: Db, cityId: string): Promise<WeatherData | null> {
  const rows = await db
    .select()
    .from(weatherSnapshots)
    .where(eq(weatherSnapshots.cityId, cityId))
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
  const rows = await db
    .select()
    .from(transitDisruptions)
    .where(eq(transitDisruptions.cityId, cityId));

  if (rows.length === 0) return null;

  return rows.map((row) => ({
    id: row.externalId ?? String(row.id),
    line: row.line,
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
    .where(eq(newsItems.cityId, cityId))
    .orderBy(desc(newsItems.publishedAt));

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
    assessment: row.relevant != null
      ? { relevant: row.relevant, confidence: row.confidence ?? undefined }
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
  const rows = await db
    .select()
    .from(ninaWarnings)
    .where(eq(ninaWarnings.cityId, cityId))
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

export type { GeocodeResult };
