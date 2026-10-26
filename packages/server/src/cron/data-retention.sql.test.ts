/**
 * Checks the SQL the retention job actually sends, built by the real Drizzle
 * query builder (`drizzle.mock()` has no connection). The sibling
 * data-retention.test.ts mocks the operators, so it cannot see which columns a
 * condition compares.
 */
import { describe, it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { runDataRetention, HISTORY_RETENTION, CAPPED_RETENTION } from './data-retention.js';
import { AQ_GRID_MAX_AGE_MS } from '../db/reads.js';
import type { Db } from '../db/index.js';

interface Statement { sql: string; params: unknown[] }

/** Runs the retention job against a db that records each DELETE instead of executing it. */
async function captureDeletes(): Promise<Statement[]> {
  const real = drizzle.mock();
  const statements: Statement[] = [];
  const db = {
    select: real.select.bind(real),
    selectDistinctOn: real.selectDistinctOn.bind(real),
    delete: (table: PgTable) => ({
      where: (condition: SQL | undefined) => ({
        returning: (fields: Record<string, never>) => {
          const { sql, params } = real.delete(table).where(condition).returning(fields).toSQL();
          statements.push({ sql, params });
          return Promise.resolve([]);
        },
      }),
    }),
    execute: () => Promise.resolve([]),
  } as unknown as Db;

  await runDataRetention(db);
  return statements;
}

async function captureDeleteSql(): Promise<string[]> {
  return (await captureDeletes()).map((s) => s.sql);
}

/** The time-based DELETE for one snapshot type (its type is the first parameter). */
async function snapshotDelete(type: string): Promise<Statement> {
  const matches = (await captureDeletes())
    .filter((s) => s.sql.startsWith('delete from "snapshots"') && s.params[0] === type);
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('data-retention: AI briefings', () => {
  it('deletes briefings past the 7-day retention', async () => {
    const summaryDeletes = (await captureDeleteSql()).filter((s) => s.startsWith('delete from "ai_summaries"'));
    expect(summaryDeletes).toContain(
      'delete from "ai_summaries" where "ai_summaries"."generated_at" < $1 returning "id"',
    );
  });

  it('treats a briefing as orphaned only when its city has no news left', async () => {
    const summaryDeletes = (await captureDeleteSql()).filter((s) => s.startsWith('delete from "ai_summaries"'));
    expect(summaryDeletes).toContain(
      'delete from "ai_summaries" where not exists (select 1 from "news_items" where "news_items"."city_id" = "ai_summaries"."city_id") returning "id"',
    );
  });

  it('never matches a briefing against single news items by hash', async () => {
    // headline_hash hashes the briefing's sorted top-10 titles; news_items.hash
    // hashes one item's URL and title. They never match, so a hash join would
    // delete every stored briefing on each run.
    const summaryDeletes = (await captureDeleteSql()).filter((s) => s.startsWith('delete from "ai_summaries"'));
    expect(summaryDeletes).toHaveLength(2);
    for (const statement of summaryDeletes) {
      expect(statement).not.toContain('headline_hash');
    }
  });
});

describe('data-retention: snapshots', () => {
  // keepLatest types: a row past retention is deleted unless it is its city's
  // newest row of the type: the latest fetched_at, and of rows tied on it the
  // highest id. So an old sole row survives, an old row with a newer one is
  // deleted, each city keeps its own newest row, and of rows tied on
  // fetched_at exactly one stays.
  const KEEP_LATEST_SQL =
    'delete from "snapshots" where ("snapshots"."type" = $1 and "snapshots"."fetched_at" < $2 and "snapshots"."id" not in ' +
    '(select distinct on ("latest"."city_id") "id" from "snapshots" "latest" where "latest"."type" = $3 ' +
    'order by "latest"."city_id", "latest"."fetched_at" desc, "latest"."id" desc)) returning "id"';
  // Every other type: by age alone, the newest row included.
  const AGE_ONLY_SQL =
    'delete from "snapshots" where ("snapshots"."type" = $1 and "snapshots"."fetched_at" < $2) returning "id"';

  // Only the types whose job runs no more often than their retention period.
  const KEEP_LATEST_TYPES = [
    'mss-social-atlas',        // weekly, 7 days
    'afstat-population',       // monthly, 7 days
    'abgwatch-bezirke',        // weekly, 7 days
    'abgwatch-bundestag',      // weekly, 7 days
    'abgwatch-state',          // weekly, 7 days
    'abgwatch-state-bezirke',  // weekly, 7 days
  ];
  const allTypes = [...HISTORY_RETENTION, ...CAPPED_RETENTION].map((c) => c.type);
  const ageOnlyTypes = allTypes.filter((t) => !KEEP_LATEST_TYPES.includes(t));

  it('opts in exactly the weekly and monthly types', () => {
    const optedIn = [...HISTORY_RETENTION, ...CAPPED_RETENTION].filter((c) => c.keepLatest).map((c) => c.type);
    expect(optedIn.sort()).toEqual([...KEEP_LATEST_TYPES].sort());
    for (const fast of ['aqi-grid', 'aponet', 'vbb-disruptions', 'tomtom-traffic', 'viz-roadworks', 'bbk-nina', 'open-meteo', 'pegelonline']) {
      expect(ageOnlyTypes).toContain(fast);
    }
  });

  it.each(KEEP_LATEST_TYPES)('keeps the newest %s row of each city however old', async (type) => {
    const { sql, params } = await snapshotDelete(type);
    expect(sql).toBe(KEEP_LATEST_SQL);
    // The subquery looks only at rows of the same type.
    expect(params[2]).toBe(type);
  });

  it.each(ageOnlyTypes)('deletes %s rows past retention by age alone', async (type) => {
    const { sql } = await snapshotDelete(type);
    expect(sql).toBe(AGE_ONLY_SQL);
  });

  it('still deletes every aqi-grid row past 6 hours, the newest one included', async () => {
    const { sql, params } = await snapshotDelete('aqi-grid');
    expect(sql).toBe(AGE_ONLY_SQL);
    const cutoff = params[1] as string;
    const ageMs = Date.now() - new Date(cutoff).getTime();
    expect(ageMs).toBeGreaterThanOrEqual(AQ_GRID_MAX_AGE_MS);
    expect(ageMs).toBeLessThan(AQ_GRID_MAX_AGE_MS + 60_000);
  });
});
