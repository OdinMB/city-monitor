/**
 * Writes a synthetic data set (see generate.ts) through the same write
 * functions the cron jobs use. wipeDatabase and seedDatabase only take a
 * handle from openLocalDatabase, which refuses any URL the local guard
 * refuses, so neither can reach a shared or production database.
 */

import { is, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PgTable } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  saveAeds, saveAirQualityGrid, saveAppointments, saveBathingSpots, saveBudget, saveConstructionSites,
  saveCouncilMeetings, saveEvents, saveFeuerwehr, saveLaborMarket, saveNewsItems, saveNinaWarnings,
  saveNoiseSensors, savePharmacies, savePoliticalDistricts, savePollen, savePopulation, saveSafetyReports,
  saveSocialAtlas, saveSummary, saveTrafficIncidents, saveTransitAlerts, saveWastewater, saveWaterLevels,
  saveWeather,
} from '../db/writes.js';
import type { CitySyntheticData } from './generate.js';
import { assertLocalDatabaseUrl } from './local-guard.js';

/** Every table in the Drizzle schema. Drizzle's own migrations journal is not one of them. */
export const APP_TABLES = Object.values<unknown>(schema).filter((value): value is PgTable => is(value, PgTable));

const HISTORY_BATCH = 200;

/** A connection openLocalDatabase checked. */
export interface LocalDatabase {
  readonly db: Db;
  /** host:port/database, for messages. */
  readonly target: string;
  close(): Promise<void>;
}

const checked = new WeakSet<LocalDatabase>();

/**
 * Connects to `url` after assertLocalDatabaseUrl, which throws for anything not local.
 * The handle is frozen, so its connection cannot be swapped after the check.
 */
export function openLocalDatabase(url: string, env: NodeJS.ProcessEnv = process.env): LocalDatabase {
  assertLocalDatabaseUrl(url, env);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const { host, pathname } = new URL(url);
  const local: LocalDatabase = Object.freeze({
    db: drizzle(client, { schema }),
    target: host + pathname,
    close: () => client.end(),
  });
  checked.add(local);
  return local;
}

function assertChecked(local: LocalDatabase): void {
  if (!checked.has(local)) {
    throw new Error('Synthetic data only goes into a database from openLocalDatabase, which checks that it is local');
  }
}

export async function wipeDatabase(local: LocalDatabase): Promise<void> {
  assertChecked(local);
  await local.db.execute(sql`TRUNCATE TABLE ${sql.join(APP_TABLES, sql`, `)} RESTART IDENTITY`);
}

/**
 * Writes one city's data set. A data set it lacks (one production holds for
 * another city only) gets no row, as for a city whose job never wrote one.
 */
export async function seedDatabase(local: LocalDatabase, data: CitySyntheticData): Promise<void> {
  assertChecked(local);
  const { db } = local;
  const { cityId } = data;

  // History first, with explicit timestamps; the writes below stamp the latest rows with now()
  for (let i = 0; i < data.history.length; i += HISTORY_BATCH) {
    await db.insert(schema.snapshots).values(
      data.history.slice(i, i + HISTORY_BATCH).map((s) => ({ cityId, type: s.type, data: s.data, fetchedAt: s.fetchedAt })),
    );
  }

  if (data.news) await saveNewsItems(db, cityId, data.news);
  const { summary } = data;
  if (summary) {
    for (const [lang, briefing] of Object.entries(summary.briefings)) {
      await saveSummary(
        db, cityId, lang,
        { briefing, headlineCount: summary.headlineCount, headlineHash: summary.headlineHash },
        summary.model, { input: 0, output: 0 }, summary.generatedAt,
      );
    }
  }
  if (data.events) await saveEvents(db, cityId, 'synthetic', data.events);
  if (data.safety) await saveSafetyReports(db, cityId, data.safety);

  if (data.weather) await saveWeather(db, cityId, data.weather);
  if (data.airQualityGrid) await saveAirQualityGrid(db, cityId, data.airQualityGrid);
  if (data.transit) await saveTransitAlerts(db, cityId, data.transit);
  if (data.nina) await saveNinaWarnings(db, cityId, data.nina);
  if (data.waterLevels) await saveWaterLevels(db, cityId, data.waterLevels);
  if (data.appointments) await saveAppointments(db, cityId, data.appointments);
  if (data.budget) await saveBudget(db, cityId, data.budget);
  if (data.construction) await saveConstructionSites(db, cityId, data.construction);
  if (data.traffic) await saveTrafficIncidents(db, cityId, data.traffic);
  if (data.pharmacies) await savePharmacies(db, cityId, data.pharmacies);
  if (data.aeds) await saveAeds(db, cityId, data.aeds);
  if (data.socialAtlas) await saveSocialAtlas(db, cityId, data.socialAtlas);
  if (data.population) await savePopulation(db, cityId, data.population.geojson, data.population.summary);
  if (data.wastewater) await saveWastewater(db, cityId, data.wastewater);
  if (data.bathing) await saveBathingSpots(db, cityId, data.bathing);
  if (data.laborMarket) await saveLaborMarket(db, cityId, data.laborMarket);
  if (data.feuerwehr) await saveFeuerwehr(db, cityId, data.feuerwehr);
  if (data.pollen) await savePollen(db, cityId, data.pollen);
  if (data.noiseSensors) await saveNoiseSensors(db, cityId, data.noiseSensors);
  if (data.councilMeetings) await saveCouncilMeetings(db, cityId, data.councilMeetings);
  for (const [level, districts] of Object.entries(data.political ?? {})) {
    await savePoliticalDistricts(db, cityId, level, districts);
  }
}
