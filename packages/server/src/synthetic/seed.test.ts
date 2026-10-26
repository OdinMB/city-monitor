import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName, type SQL, type Table } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { SNAPSHOT_TYPES } from '../db/schema.js';
import { generateSyntheticData, syntheticModel } from './generate.js';
import { LOCAL_DATABASE_URL } from './local-guard.js';
import { APP_TABLES, openLocalDatabase, seedDatabase, wipeDatabase, type LocalDatabase } from './seed.js';

// No real connection: postgres() returns a stub client and drizzle() the recording fake below
const pg = vi.hoisted(() => ({ db: undefined as unknown, end: vi.fn(async () => {}) }));
vi.mock('postgres', () => ({ default: vi.fn(() => ({ end: pg.end })) }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: vi.fn(() => pg.db) }));

type Row = Record<string, unknown>;

/** Records what the write functions insert, per table name. */
function fakeDb() {
  const rows: Record<string, Row[]> = {};
  const executed: SQL[] = [];
  pg.db = {
    insert: (table: Table) => ({
      values: (values: Row | Row[]) => {
        (rows[getTableName(table)] ??= []).push(...[values].flat());
        const done = Promise.resolve();
        return { onConflictDoUpdate: () => done, then: (resolve: () => void) => done.then(resolve) };
      },
    }),
    execute: async (query: SQL) => {
      executed.push(query);
    },
  };
  return { local: openLocalDatabase(LOCAL_DATABASE_URL, {}), rows, executed };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('openLocalDatabase', () => {
  it('refuses a database that is not local before connecting', () => {
    expect(() => openLocalDatabase('postgres://u:secret@db.example.com/city_monitor_dev', {})).toThrow(/not this machine/);
    expect(() => openLocalDatabase(`${LOCAL_DATABASE_URL}?host=db.example.com`, {})).toThrow(/query parameter host/);
    expect(() => openLocalDatabase('postgres://u:secret@localhost:5434/city_monitor', {})).toThrow(/database city_monitor/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it('connects to the docker-compose database and closes the client', async () => {
    const local = openLocalDatabase(LOCAL_DATABASE_URL, {});
    expect(postgres).toHaveBeenCalledWith(LOCAL_DATABASE_URL, expect.objectContaining({ max: 1 }));
    expect(local.target).toBe('localhost:5434/city_monitor_dev');
    await local.close();
    expect(pg.end).toHaveBeenCalled();
  });
});

describe('wipeDatabase and seedDatabase', () => {
  it('refuse a handle that openLocalDatabase did not check', async () => {
    const { local, rows, executed } = fakeDb();
    const forged: LocalDatabase = { db: local.db, target: 'db.example.com/city_monitor', close: async () => {} };

    await expect(wipeDatabase(forged)).rejects.toThrow(/openLocalDatabase/);
    await expect(seedDatabase(forged, generateSyntheticData({ now: new Date() }))).rejects.toThrow(/openLocalDatabase/);
    expect(executed).toEqual([]);
    expect(rows).toEqual({});
  });

  it('keep the connection a checked handle was opened with', async () => {
    const { local, rows, executed } = fakeDb();
    const checkedDb = local.db;
    const otherExecuted: unknown[] = [];
    const other = { execute: async (query: unknown) => { otherExecuted.push(query); } };

    expect(Object.isFrozen(local)).toBe(true);
    expect(() => { (local as { db: unknown }).db = other; }).toThrow(TypeError);
    expect(() => Object.defineProperty(local, 'db', { value: other })).toThrow(TypeError);
    expect(local.db).toBe(checkedDb);

    await wipeDatabase(local);
    await seedDatabase(local, generateSyntheticData({ now: new Date() }));
    expect(executed).toHaveLength(1);
    expect(rows.snapshots?.length).toBeGreaterThan(0);
    expect(otherExecuted).toEqual([]);
  });
});

describe('wipeDatabase', () => {
  it('truncates every table in the schema and nothing else', async () => {
    const { local, executed } = fakeDb();
    await wipeDatabase(local);

    expect(executed).toHaveLength(1);
    const { sql } = new PgDialect().sqlToQuery(executed[0]!);
    expect(APP_TABLES.map((t) => getTableName(t)).sort())
      .toEqual(['ai_summaries', 'events', 'geocode_lookups', 'news_items', 'safety_reports', 'snapshots']);
    expect(sql).toMatch(/^TRUNCATE TABLE .* RESTART IDENTITY$/);
    for (const table of APP_TABLES) expect(sql).toContain(`"${getTableName(table)}"`);
    expect(sql).not.toContain('drizzle');
  });
});

describe('seedDatabase', () => {
  it('writes every snapshot type and every table the app reads', async () => {
    const { local, rows } = fakeDb();
    const data = generateSyntheticData({ now: new Date(), seed: 7 });
    await seedDatabase(local, data);

    const snapshots = rows.snapshots ?? [];
    const types = new Set(snapshots.map((r) => r.type));
    // A new data source fails here until generate.ts and seed.ts cover it
    expect(SNAPSHOT_TYPES.filter((t) => !types.has(t))).toEqual([]);

    // One current row per type, stamped by the database; history rows carry their own time
    const current = snapshots.filter((r) => !('fetchedAt' in r));
    expect(current).toHaveLength(SNAPSHOT_TYPES.length);
    expect(snapshots.length - current.length).toBe(data.history.length);

    expect(rows.news_items).toHaveLength(data.news.length);
    expect(rows.events).toHaveLength(data.events.length);
    expect(rows.safety_reports).toHaveLength(data.safety.length);
    expect((rows.ai_summaries ?? []).map((r) => r.lang).sort()).toEqual(['ar', 'de', 'en', 'tr']);
    for (const summary of rows.ai_summaries ?? []) {
      // dev-synthetic.ts reads the seed back from the model
      expect(summary).toMatchObject({ model: syntheticModel(7), inputTokens: 0, outputTokens: 0 });
    }

    const all = Object.values(rows).flat();
    expect(all.every((r) => r.cityId === 'berlin')).toBe(true);
  });
});
