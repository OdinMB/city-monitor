/**
 * Checks the SQL the retention job actually sends for AI briefings, built by
 * the real Drizzle query builder (`drizzle.mock()` has no connection). The
 * sibling data-retention.test.ts mocks the operators, so it cannot see which
 * columns a condition compares.
 */
import { describe, it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { runDataRetention } from './data-retention.js';
import type { Db } from '../db/index.js';

/** Runs the retention job against a db that records each DELETE's SQL instead of executing it. */
async function captureDeletes(): Promise<string[]> {
  const real = drizzle.mock();
  const statements: string[] = [];
  const db = {
    select: real.select.bind(real),
    delete: (table: PgTable) => ({
      where: (condition: SQL | undefined) => ({
        returning: (fields: Record<string, never>) => {
          statements.push(real.delete(table).where(condition).returning(fields).toSQL().sql);
          return Promise.resolve([]);
        },
      }),
    }),
    execute: () => Promise.resolve([]),
  } as unknown as Db;

  await runDataRetention(db);
  return statements;
}

describe('data-retention: AI briefings', () => {
  it('deletes briefings past the 7-day retention', async () => {
    const summaryDeletes = (await captureDeletes()).filter((s) => s.startsWith('delete from "ai_summaries"'));
    expect(summaryDeletes).toContain(
      'delete from "ai_summaries" where "ai_summaries"."generated_at" < $1 returning "id"',
    );
  });

  it('treats a briefing as orphaned only when its city has no news left', async () => {
    const summaryDeletes = (await captureDeletes()).filter((s) => s.startsWith('delete from "ai_summaries"'));
    expect(summaryDeletes).toContain(
      'delete from "ai_summaries" where not exists (select 1 from "news_items" where "news_items"."city_id" = "ai_summaries"."city_id") returning "id"',
    );
  });

  it('never matches a briefing against single news items by hash', async () => {
    // headline_hash hashes the briefing's sorted top-10 titles; news_items.hash
    // hashes one item's URL and title. They never match, so a hash join would
    // delete every stored briefing on each run.
    const summaryDeletes = (await captureDeletes()).filter((s) => s.startsWith('delete from "ai_summaries"'));
    expect(summaryDeletes).toHaveLength(2);
    for (const statement of summaryDeletes) {
      expect(statement).not.toContain('headline_hash');
    }
  });
});
