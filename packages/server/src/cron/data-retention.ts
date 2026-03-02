/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { lt, and, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import {
  weatherSnapshots,
  transitDisruptions,
  safetyReports,
  aiSummaries,
} from '../db/schema.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('data-retention');

const DAY_MS = 86_400_000;

/**
 * Prunes old data from the database:
 * - weather_snapshots older than 30 days
 * - resolved transit_disruptions older than 48 hours
 * - safety_reports older than 7 days
 * - ai_summaries older than 30 days
 */
export function createDataRetention(db: Db) {
  return async () => {
    const now = Date.now();

    try {
      await db.delete(weatherSnapshots)
        .where(lt(weatherSnapshots.fetchedAt, new Date(now - 30 * DAY_MS)));

      await db.delete(transitDisruptions)
        .where(and(
          eq(transitDisruptions.resolved, true),
          lt(transitDisruptions.fetchedAt, new Date(now - 2 * DAY_MS)),
        ));

      await db.delete(safetyReports)
        .where(lt(safetyReports.fetchedAt, new Date(now - 7 * DAY_MS)));

      await db.delete(aiSummaries)
        .where(lt(aiSummaries.generatedAt, new Date(now - 30 * DAY_MS)));

      log.info('data retention complete');
    } catch (err) {
      log.error('data retention failed', err);
    }
  };
}
