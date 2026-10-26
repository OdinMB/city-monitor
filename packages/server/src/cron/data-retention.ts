/**
 * Prunes rows older than the configured retention period from all tables.
 * Two strategies:
 * - History types: time-based retention matching their max query range
 * - Non-history types: tighter time-based + row-count cap per (cityId, type)
 *
 * Types marked `keepLatest` keep their newest row per (cityId, type) however
 * old. Every other type is deleted by age alone.
 */

import { and, desc, eq, lt, notExists, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/index.js';
import {
  snapshots,
  events,
  safetyReports,
  newsItems,
  aiSummaries,
} from '../db/schema.js';
import type { SnapshotType } from '../db/schema.js';
import { AQ_GRID_MAX_AGE_MS } from '../db/reads.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('data-retention');

const DAY_MS = 86_400_000;

/** Row-count cap for non-history snapshot types */
export const ROW_CAP = 100;

export interface SnapshotRetention {
  type: SnapshotType;
  retentionMs: number;
  /**
   * Never delete a city's newest row by age. Only for types whose job runs no
   * more often than the retention period: without it they lose their only row
   * after one failed run (or, if monthly, every month), and cache warming and
   * the routes' DB fallback find nothing. Leave it off for frequently fetched
   * types, whose reads mostly have no age limit and would serve a kept row
   * however old.
   */
  keepLatest?: boolean;
}

/** History types: time-based only, matching their max query range */
export const HISTORY_RETENTION: SnapshotRetention[] = [
  { type: 'open-meteo',      retentionMs: 7 * DAY_MS },
  { type: 'pegelonline',     retentionMs: 30 * DAY_MS },
  { type: 'ba-labor-market', retentionMs: 730 * DAY_MS },
];

/** Non-history types: tighter time-based + row-count cap */
export const CAPPED_RETENTION: SnapshotRetention[] = [
  // Kept only as long as the grid read serves a row (6 hours), the newest one
  // included, so never keepLatest. Rows written before WAQI stations were left
  // out of the stored grid still hold them.
  { type: 'aqi-grid',           retentionMs: AQ_GRID_MAX_AGE_MS },

  // High/medium frequency (2 days)
  { type: 'vbb-disruptions',    retentionMs: 2 * DAY_MS },
  { type: 'tomtom-traffic',     retentionMs: 2 * DAY_MS },
  { type: 'viz-roadworks',      retentionMs: 2 * DAY_MS },
  { type: 'bbk-nina',           retentionMs: 2 * DAY_MS },
  { type: 'aponet',             retentionMs: 2 * DAY_MS },
  { type: 'service-berlin',     retentionMs: 2 * DAY_MS },
  { type: 'lageso-wastewater',  retentionMs: 2 * DAY_MS },
  { type: 'lageso-bathing',     retentionMs: 2 * DAY_MS },
  { type: 'dwd-pollen',         retentionMs: 2 * DAY_MS },
  { type: 'sc-dnms',            retentionMs: 2 * DAY_MS },
  { type: 'oparl-meetings',     retentionMs: 2 * DAY_MS },

  // Infrequent (7 days). keepLatest where the job runs weekly or monthly; the
  // daily jobs write a fresh row each run.
  { type: 'berlin-haushalt',    retentionMs: 7 * DAY_MS },                   // daily
  { type: 'osm-aeds',           retentionMs: 7 * DAY_MS },                   // daily
  { type: 'mss-social-atlas',   retentionMs: 7 * DAY_MS, keepLatest: true }, // weekly
  { type: 'bf-feuerwehr',       retentionMs: 7 * DAY_MS },                   // daily
  { type: 'afstat-population',  retentionMs: 7 * DAY_MS, keepLatest: true }, // monthly
  { type: 'abgwatch-bezirke',       retentionMs: 7 * DAY_MS, keepLatest: true }, // weekly
  { type: 'abgwatch-bundestag',     retentionMs: 7 * DAY_MS, keepLatest: true }, // weekly
  { type: 'abgwatch-state',         retentionMs: 7 * DAY_MS, keepLatest: true }, // weekly
  { type: 'abgwatch-state-bezirke', retentionMs: 7 * DAY_MS, keepLatest: true }, // weekly
];

export async function runDataRetention(db: Db) {
  const now = Date.now();

  type Task = { name: string; fn: () => Promise<{ id: number }[]> };

  // --- Phase 1: time-based deletion for ALL snapshot types ---
  // For keepLatest types the newest row of each city is exempt: the latest
  // fetched_at, and of rows tied on it the highest id, so exactly one stays.
  const latest = alias(snapshots, 'latest');
  const newestPerCity = (type: SnapshotType) => db
    .selectDistinctOn([latest.cityId], { id: latest.id })
    .from(latest)
    .where(eq(latest.type, type))
    .orderBy(latest.cityId, desc(latest.fetchedAt), desc(latest.id));

  const allSnapshotConfigs = [...HISTORY_RETENTION, ...CAPPED_RETENTION];
  const snapshotTasks: Task[] = allSnapshotConfigs.map(({ type, retentionMs, keepLatest }) => ({
    name: type,
    fn: () => db.delete(snapshots).where(
      and(
        eq(snapshots.type, type),
        lt(snapshots.fetchedAt, new Date(now - retentionMs)),
        keepLatest ? notInArray(snapshots.id, newestPerCity(type)) : undefined,
      ),
    ).returning({ id: snapshots.id }),
  }));

  // Non-snapshot tables (3 days for news/events/safety, 7 days for summaries)
  const otherTasks: Task[] = [
    { name: 'news', fn: () => db.delete(newsItems).where(lt(newsItems.fetchedAt, new Date(now - 3 * DAY_MS))).returning({ id: newsItems.id }) },
    { name: 'events', fn: () => db.delete(events).where(lt(events.fetchedAt, new Date(now - 3 * DAY_MS))).returning({ id: events.id }) },
    { name: 'safety', fn: () => db.delete(safetyReports).where(lt(safetyReports.fetchedAt, new Date(now - 3 * DAY_MS))).returning({ id: safetyReports.id }) },

    // AI summaries (7 days)
    { name: 'summaries', fn: () => db.delete(aiSummaries).where(lt(aiSummaries.generatedAt, new Date(now - 7 * DAY_MS))).returning({ id: aiSummaries.id }) },

    // Orphaned summaries: a briefing's city has no news items left (e.g. the city
    // was deactivated). Not keyed on headlineHash: that hashes the briefing's
    // sorted top-10 titles, while newsItems.hash hashes one item's URL and title,
    // so the two never match and a hash join would delete every briefing.
    { name: 'orphan_summaries', fn: () => db.delete(aiSummaries).where(
      notExists(
        db.select({ one: sql`1` })
          .from(newsItems)
          .where(eq(newsItems.cityId, aiSummaries.cityId))
      )
    ).returning({ id: aiSummaries.id }) },
  ];

  const tasks = [...snapshotTasks, ...otherTasks];
  const results = await Promise.allSettled(tasks.map((t) => t.fn()));
  let cleaned = 0;
  let totalDeleted = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      cleaned++;
      const count = r.value.length;
      totalDeleted += count;
      if (count > 0) {
        log.info(`  ${tasks[i].name}: ${count} rows deleted`);
      }
    } else {
      log.error(`cleanup ${tasks[i].name} failed`, r.reason);
    }
  }

  // --- Phase 2: row-count cap for non-history types ---
  // Keeps the ROW_CAP newest rows per city; rn = 1 is the newest, so the cap
  // never removes it.
  const capTypes = CAPPED_RETENTION.map((c) => c.type);
  const capResults = await Promise.allSettled(
    capTypes.map((type) =>
      db.execute(sql`
        DELETE FROM snapshots
        WHERE type = ${type}
          AND id NOT IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (PARTITION BY city_id ORDER BY fetched_at DESC) AS rn
              FROM snapshots WHERE type = ${type}
            ) sub WHERE rn <= ${ROW_CAP}
          )
      `)
    )
  );
  let capped = 0;
  for (let i = 0; i < capResults.length; i++) {
    const r = capResults[i];
    if (r.status === 'fulfilled') {
      capped++;
    } else {
      log.error(`row-cap ${capTypes[i]} failed`, r.reason);
    }
  }

  log.info(`data retention complete (${cleaned}/${tasks.length} time-pruned, ${capped}/${capTypes.length} row-capped, ${totalDeleted} rows deleted)`);
}

export function createDataRetention(db: Db) {
  return async () => {
    log.info('data retention starting');
    await runDataRetention(db);
  };
}
