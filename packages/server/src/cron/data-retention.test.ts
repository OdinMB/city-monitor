import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  lt: vi.fn((col, val) => ({ op: 'lt', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col, val) => ({ op: 'eq', col, val })),
  notExists: vi.fn((subquery) => ({ op: 'notExists', subquery })),
  sql: Object.assign(vi.fn(() => ({ __sql: true })), {
    raw: vi.fn((s: string) => ({ __raw: s })),
  }),
}));

import { createDataRetention, HISTORY_RETENTION, CAPPED_RETENTION } from './data-retention.js';
import type { Db } from '../db/index.js';

const TOTAL_SNAPSHOT_TYPES = HISTORY_RETENTION.length + CAPPED_RETENTION.length;
const NON_SNAPSHOT_TASKS = 5; // news, events, safety, summaries, orphan_summaries
const TOTAL_TIME_TASKS = TOTAL_SNAPSHOT_TYPES + NON_SNAPSHOT_TASKS;

function createMockDb() {
  const returning = vi.fn().mockResolvedValue([]);
  const where = vi.fn().mockReturnValue({ returning });
  const deleteFn = vi.fn().mockReturnValue({ where });
  // Sub-select chain: db.select().from().where() used inside notExists
  const subWhere = vi.fn().mockReturnValue({ __subquery: true });
  const from = vi.fn().mockReturnValue({ where: subWhere });
  const select = vi.fn().mockReturnValue({ from });
  // db.execute for raw SQL row-count pruning
  const execute = vi.fn().mockResolvedValue([]);
  return {
    db: { delete: deleteFn, select, execute } as unknown as Db,
    deleteFn,
    where,
    returning,
    execute,
  };
}

describe('data-retention', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T12:00:00Z'));
  });

  it('runs time-based cleanup for all snapshot types + non-snapshot tables', async () => {
    const mock = createMockDb();
    const handler = createDataRetention(mock.db);
    await handler();

    expect(mock.deleteFn).toHaveBeenCalledTimes(TOTAL_TIME_TASKS);
    expect(mock.where).toHaveBeenCalledTimes(TOTAL_TIME_TASKS);
  });

  it('runs row-count pruning for non-history snapshot types', async () => {
    const mock = createMockDb();
    const handler = createDataRetention(mock.db);
    await handler();

    expect(mock.execute).toHaveBeenCalledTimes(CAPPED_RETENTION.length);
  });

  it('does NOT run row-count pruning for history types', async () => {
    const mock = createMockDb();
    const handler = createDataRetention(mock.db);
    await handler();

    const executeCalls = mock.execute.mock.calls;
    const executedSql = executeCalls.map((c) => JSON.stringify(c));
    const joinedSql = executedSql.join(' ');
    for (const { type } of HISTORY_RETENTION) {
      expect(joinedSql).not.toContain(type);
    }
  });

  it('uses tighter retention periods for non-history types', async () => {
    const { lt } = await import('drizzle-orm');
    const mock = createMockDb();
    const handler = createDataRetention(mock.db);
    await handler();

    // High-frequency non-history types should use 2 days
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    const ltCalls = vi.mocked(lt).mock.calls;
    const ltDates = ltCalls.map(([, val]) => val).filter((v) => v instanceof Date);
    expect(ltDates.some((d) => d.getTime() === twoDaysAgo.getTime())).toBe(true);
  });

  it('uses 3-day retention for non-snapshot tables', async () => {
    const { lt } = await import('drizzle-orm');
    const mock = createMockDb();
    const handler = createDataRetention(mock.db);
    await handler();

    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    const ltCalls = vi.mocked(lt).mock.calls;
    const ltDates = ltCalls.map(([, val]) => val).filter((v) => v instanceof Date);
    expect(ltDates.some((d) => d.getTime() === threeDaysAgo.getTime())).toBe(true);
  });

  it('uses 7-day retention for summaries', async () => {
    const { lt } = await import('drizzle-orm');
    const mock = createMockDb();
    const handler = createDataRetention(mock.db);
    await handler();

    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const ltCalls = vi.mocked(lt).mock.calls;
    const ltDates = ltCalls.map(([, val]) => val).filter((v) => v instanceof Date);
    expect(ltDates.some((d) => d.getTime() === sevenDaysAgo.getTime())).toBe(true);
  });

  it('runs without errors when DB is empty', async () => {
    const mock = createMockDb();
    const handler = createDataRetention(mock.db);
    await expect(handler()).resolves.not.toThrow();
  });

  it('continues cleanup even if one table fails', async () => {
    const returning = vi.fn()
      .mockResolvedValueOnce([])    // first table OK
      .mockRejectedValueOnce(new Error('DB error')) // second table fails
      .mockResolvedValue([]);       // rest OK
    const where = vi.fn().mockReturnValue({ returning });
    const deleteFn = vi.fn().mockReturnValue({ where });
    const subWhere = vi.fn().mockReturnValue({ __subquery: true });
    const from = vi.fn().mockReturnValue({ where: subWhere });
    const select = vi.fn().mockReturnValue({ from });
    const execute = vi.fn().mockResolvedValue([]);
    const db = { delete: deleteFn, select, execute } as unknown as Db;

    const handler = createDataRetention(db);
    await expect(handler()).resolves.not.toThrow();
    expect(deleteFn).toHaveBeenCalledTimes(TOTAL_TIME_TASKS);
  });

  it('continues row-count pruning even if one fails', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const deleteFn = vi.fn().mockReturnValue({ where });
    const subWhere = vi.fn().mockReturnValue({ __subquery: true });
    const from = vi.fn().mockReturnValue({ where: subWhere });
    const select = vi.fn().mockReturnValue({ from });
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('SQL error'))
      .mockResolvedValue([]);
    const db = { delete: deleteFn, select, execute } as unknown as Db;

    const handler = createDataRetention(db);
    await expect(handler()).resolves.not.toThrow();
    expect(execute).toHaveBeenCalledTimes(CAPPED_RETENTION.length);
  });
});
