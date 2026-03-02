/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveWeather, saveTransitAlerts, saveEvents, saveSafetyReports, saveSummary } from './writes.js';

function createMockDb() {
  const txOps = {
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };

  const db = {
    transaction: vi.fn(async (fn: (tx: typeof txOps) => Promise<void>) => {
      await fn(txOps);
    }),
  };

  return { db: db as any, txOps };
}

describe('DB writes', () => {
  let db: any;
  let txOps: any;

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    txOps = mock.txOps;
  });

  it('saveWeather calls transaction with delete + insert', async () => {
    const data = {
      current: { temp: 10 },
      hourly: [{ time: 'now', temp: 10 }],
      daily: [{ date: 'today' }],
      alerts: [],
    };

    await saveWeather(db, 'berlin', data as any);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.delete).toHaveBeenCalled();
    expect(txOps.insert).toHaveBeenCalled();
  });

  it('saveTransitAlerts calls transaction with delete + batch insert', async () => {
    const alerts = [
      { id: '1', line: 'U2', type: 'disruption', severity: 'high', message: 'Test', detail: 'Test detail', station: 'Alexanderplatz', location: { lat: 52.52, lon: 13.41 }, affectedStops: [] },
    ];

    await saveTransitAlerts(db, 'berlin', alerts as any);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.delete).toHaveBeenCalled();
    expect(txOps.insert).toHaveBeenCalled();
  });

  it('saveTransitAlerts skips insert when alerts array is empty', async () => {
    await saveTransitAlerts(db, 'berlin', []);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.delete).toHaveBeenCalled();
    expect(txOps.insert).not.toHaveBeenCalled();
  });

  it('saveEvents calls transaction with delete + batch insert', async () => {
    const items = [
      { id: '1', title: 'Test', date: '2026-03-03T19:00:00Z', category: 'music', url: 'https://example.com' },
    ];

    await saveEvents(db, 'berlin', items as any);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.insert).toHaveBeenCalled();
  });

  it('saveSafetyReports calls transaction with delete + batch insert', async () => {
    const reports = [
      { id: '1', title: 'Report', description: 'Test', publishedAt: '2026-03-01T00:00:00Z', url: 'https://example.com' },
    ];

    await saveSafetyReports(db, 'berlin', reports as any);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.insert).toHaveBeenCalled();
  });

  it('saveSummary calls transaction with delete + insert', async () => {
    const summary = { briefing: 'Test briefing', headlineCount: 5, headlineHash: 'abc123' };

    await saveSummary(db, 'berlin', summary, 'gpt-4.1-mini', { input: 100, output: 50 });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.delete).toHaveBeenCalled();
    expect(txOps.insert).toHaveBeenCalled();
  });
});
