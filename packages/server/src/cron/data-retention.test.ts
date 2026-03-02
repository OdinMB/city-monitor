/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  lt: vi.fn((col, val) => ({ op: 'lt', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col, val) => ({ op: 'eq', col, val })),
}));

import { createDataRetention } from './data-retention.js';

function createMockDb() {
  const deleteFn = vi.fn().mockReturnThis();
  const where = vi.fn().mockResolvedValue([]);
  return {
    db: { delete: deleteFn } as any,
    deleteFn,
    where,
    setup() {
      deleteFn.mockReturnValue({ where });
    },
  };
}

describe('data-retention', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T12:00:00Z'));
  });

  it('deletes old weather snapshots (>30 days)', async () => {
    const mock = createMockDb();
    mock.setup();
    const handler = createDataRetention(mock.db);
    await handler();

    // Should call delete for weather, transit, safety, summaries
    expect(mock.deleteFn).toHaveBeenCalled();
    expect(mock.where).toHaveBeenCalled();
  });

  it('runs without errors when DB is empty', async () => {
    const mock = createMockDb();
    mock.setup();
    const handler = createDataRetention(mock.db);
    await expect(handler()).resolves.not.toThrow();
  });
});
