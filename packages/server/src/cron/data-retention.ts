/**
 * Prunes rows older than the configured retention period from all tables.
 * Since save functions no longer delete before inserting, historical data
 * accumulates and this cron is the sole cleanup mechanism.
 */

import { and, eq, lt, notInArray } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import {
  snapshots,
  events,
  safetyReports,
  newsItems,
  aiSummaries,
} from '../db/schema.js';
import type { SnapshotType } from '../db/schema.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('data-retention');

const DAY_MS = 86_400_000;

/** Retention config for the unified snapshots table */
const SNAPSHOT_RETENTION: Array<{ type: SnapshotType; retentionMs: number }> = [
  // Frequently updated (7 days)
  { type: 'open-meteo',         retentionMs: 7 * DAY_MS },
  { type: 'vbb-disruptions',    retentionMs: 7 * DAY_MS },
  { type: 'tomtom-traffic',     retentionMs: 7 * DAY_MS },
  { type: 'viz-roadworks',      retentionMs: 7 * DAY_MS },
  { type: 'bbk-nina',           retentionMs: 7 * DAY_MS },
  { type: 'aponet',             retentionMs: 7 * DAY_MS },
  { type: 'service-berlin',     retentionMs: 7 * DAY_MS },
  { type: 'lageso-wastewater',  retentionMs: 7 * DAY_MS },
  { type: 'lageso-bathing',     retentionMs: 7 * DAY_MS },
  { type: 'dwd-pollen',         retentionMs: 7 * DAY_MS },
  { type: 'sc-dnms',            retentionMs: 7 * DAY_MS },
  { type: 'oparl-meetings',     retentionMs: 7 * DAY_MS },

  // Extended for historical charts
  { type: 'aqi-grid',           retentionMs: 30 * DAY_MS },
  { type: 'pegelonline',        retentionMs: 30 * DAY_MS },
  { type: 'ba-labor-market',    retentionMs: 730 * DAY_MS },

  // Infrequent data (30 days)
  { type: 'berlin-haushalt',    retentionMs: 30 * DAY_MS },
  { type: 'osm-aeds',           retentionMs: 30 * DAY_MS },
  { type: 'mss-social-atlas',   retentionMs: 30 * DAY_MS },
  { type: 'bf-feuerwehr',       retentionMs: 30 * DAY_MS },
  { type: 'afstat-population',  retentionMs: 30 * DAY_MS },

  // Political sub-types (30 days)
  { type: 'abgwatch-bezirke',       retentionMs: 30 * DAY_MS },
  { type: 'abgwatch-bundestag',     retentionMs: 30 * DAY_MS },
  { type: 'abgwatch-state',         retentionMs: 30 * DAY_MS },
  { type: 'abgwatch-state-bezirke', retentionMs: 30 * DAY_MS },
];

export function createDataRetention(db: Db) {
  return async () => {
    const now = Date.now();
    let cleaned = 0;

    // Snapshot retention (config-driven)
    const snapshotTasks = SNAPSHOT_RETENTION.map(({ type, retentionMs }) => ({
      name: type,
      fn: () => db.delete(snapshots).where(
        and(eq(snapshots.type, type), lt(snapshots.fetchedAt, new Date(now - retentionMs))),
      ),
    }));

    // Non-snapshot tables
    const otherTasks: Array<{ name: string; fn: () => Promise<unknown> }> = [
      { name: 'news', fn: () => db.delete(newsItems).where(lt(newsItems.fetchedAt, new Date(now - 7 * DAY_MS))) },
      { name: 'events', fn: () => db.delete(events).where(lt(events.fetchedAt, new Date(now - 7 * DAY_MS))) },
      { name: 'safety', fn: () => db.delete(safetyReports).where(lt(safetyReports.fetchedAt, new Date(now - 7 * DAY_MS))) },

      // AI summaries (30 days)
      { name: 'summaries', fn: () => db.delete(aiSummaries).where(lt(aiSummaries.generatedAt, new Date(now - 30 * DAY_MS))) },

      // Orphaned summaries: delete summaries whose headlineHash no longer exists in newsItems
      { name: 'orphan_summaries', fn: () => db.delete(aiSummaries).where(
        notInArray(aiSummaries.headlineHash, db.select({ hash: newsItems.hash }).from(newsItems))
      ) },
    ];

    const tasks = [...snapshotTasks, ...otherTasks];

    for (const task of tasks) {
      try {
        await task.fn();
        cleaned++;
      } catch (err) {
        log.error(`cleanup ${task.name} failed`, err);
      }
    }

    log.info(`data retention complete (${cleaned}/${tasks.length} tables cleaned)`);
  };
}
