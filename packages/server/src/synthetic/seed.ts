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
import type { SyntheticData } from './generate.js';
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

/** Connects to `url` after assertLocalDatabaseUrl, which throws for anything not local. */
export function openLocalDatabase(url: string, env: NodeJS.ProcessEnv = process.env): LocalDatabase {
  assertLocalDatabaseUrl(url, env);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const { host, pathname } = new URL(url);
  const local: LocalDatabase = {
    db: drizzle(client, { schema }),
    target: host + pathname,
    close: () => client.end(),
  };
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

export async function seedDatabase(local: LocalDatabase, data: SyntheticData): Promise<void> {
  assertChecked(local);
  const { db } = local;
  const { cityId } = data;

  // History first, with explicit timestamps; the writes below stamp the latest rows with now()
  for (let i = 0; i < data.history.length; i += HISTORY_BATCH) {
    await db.insert(schema.snapshots).values(
      data.history.slice(i, i + HISTORY_BATCH).map((s) => ({ cityId, type: s.type, data: s.data, fetchedAt: s.fetchedAt })),
    );
  }

  await saveNewsItems(db, cityId, data.news);
  const { summary } = data;
  for (const [lang, briefing] of Object.entries(summary.briefings)) {
    await saveSummary(
      db, cityId, lang,
      { briefing, headlineCount: summary.headlineCount, headlineHash: summary.headlineHash },
      summary.model, { input: 0, output: 0 }, summary.generatedAt,
    );
  }
  await saveEvents(db, cityId, 'synthetic', data.events);
  await saveSafetyReports(db, cityId, data.safety);

  await saveWeather(db, cityId, data.weather);
  await saveAirQualityGrid(db, cityId, data.airQualityGrid);
  await saveTransitAlerts(db, cityId, data.transit);
  await saveNinaWarnings(db, cityId, data.nina);
  await saveWaterLevels(db, cityId, data.waterLevels);
  await saveAppointments(db, cityId, data.appointments);
  await saveBudget(db, cityId, data.budget);
  await saveConstructionSites(db, cityId, data.construction);
  await saveTrafficIncidents(db, cityId, data.traffic);
  await savePharmacies(db, cityId, data.pharmacies);
  await saveAeds(db, cityId, data.aeds);
  await saveSocialAtlas(db, cityId, data.socialAtlas);
  await savePopulation(db, cityId, data.population.geojson, data.population.summary);
  await saveWastewater(db, cityId, data.wastewater);
  await saveBathingSpots(db, cityId, data.bathing);
  await saveLaborMarket(db, cityId, data.laborMarket);
  await saveFeuerwehr(db, cityId, data.feuerwehr);
  await savePollen(db, cityId, data.pollen);
  await saveNoiseSensors(db, cityId, data.noiseSensors);
  await saveCouncilMeetings(db, cityId, data.councilMeetings);
  for (const [level, districts] of Object.entries(data.political)) {
    await savePoliticalDistricts(db, cityId, level, districts);
  }
}
