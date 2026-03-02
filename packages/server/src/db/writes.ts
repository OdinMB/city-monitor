/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { eq } from 'drizzle-orm';
import type { Db } from './index.js';
import {
  weatherSnapshots,
  transitDisruptions,
  events,
  safetyReports,
  aiSummaries,
} from './schema.js';
import type { WeatherData } from '../cron/ingest-weather.js';
import type { TransitAlert } from '../cron/ingest-transit.js';
import type { CityEvent } from '../cron/ingest-events.js';
import type { SafetyReport } from '../cron/ingest-safety.js';

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

export async function saveEvents(db: Db, cityId: string, items: CityEvent[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(events).where(eq(events.cityId, cityId));
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
        hash: r.id,
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
