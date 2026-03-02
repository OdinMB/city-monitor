/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveWeather, saveTransitAlerts, saveEvents, saveSafetyReports, saveSummary, saveAirQualityGrid } from './writes.js';
import type { Db } from './index.js';
import type { WeatherData } from '../cron/ingest-weather.js';
import type { TransitAlert } from '../cron/ingest-transit.js';
import type { CityEvent } from '../cron/ingest-events.js';
import type { SafetyReport } from '../cron/ingest-safety.js';

interface MockTxOps {
  delete: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
}

function createMockDb() {
  const txOps: MockTxOps = {
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };

  const db = {
    transaction: vi.fn(async (fn: (tx: MockTxOps) => Promise<void>) => {
      await fn(txOps);
    }),
  };

  return { db: db as unknown as Db, txOps };
}

describe('DB writes', () => {
  let db: Db;
  let txOps: MockTxOps;

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

    await saveWeather(db, 'berlin', data as unknown as WeatherData);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.delete).toHaveBeenCalled();
    expect(txOps.insert).toHaveBeenCalled();
  });

  it('saveTransitAlerts calls transaction with delete + batch insert', async () => {
    const alerts = [
      { id: '1', line: 'U2', type: 'disruption', severity: 'high', message: 'Test', detail: 'Test detail', station: 'Alexanderplatz', location: { lat: 52.52, lon: 13.41 }, affectedStops: [] },
    ];

    await saveTransitAlerts(db, 'berlin', alerts as unknown as TransitAlert[]);
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

  it('saveEvents calls transaction with per-source delete + batch insert', async () => {
    const items = [
      { id: '1', title: 'Test', date: '2026-03-03T19:00:00Z', category: 'music', url: 'https://example.com', source: 'kulturdaten' },
    ];

    await saveEvents(db, 'berlin', 'kulturdaten', items as unknown as CityEvent[]);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.delete).toHaveBeenCalled();
    expect(txOps.insert).toHaveBeenCalled();
  });

  it('saveSafetyReports calls transaction with delete + batch insert', async () => {
    const reports = [
      { id: '1', title: 'Report', description: 'Test', publishedAt: '2026-03-01T00:00:00Z', url: 'https://example.com' },
    ];

    await saveSafetyReports(db, 'berlin', reports as unknown as SafetyReport[]);
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

  it('saveAirQualityGrid calls transaction with delete + batch insert', async () => {
    const points = [
      { lat: 52.52, lon: 13.41, europeanAqi: 42, station: 'Berlin Mitte', url: 'https://example.com' },
      { lat: 52.48, lon: 13.35, europeanAqi: 35, station: 'Steglitz' },
    ];

    await saveAirQualityGrid(db, 'berlin', points);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.delete).toHaveBeenCalled();
    expect(txOps.insert).toHaveBeenCalled();
  });

  it('saveAirQualityGrid skips insert when points array is empty', async () => {
    await saveAirQualityGrid(db, 'berlin', []);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txOps.delete).toHaveBeenCalled();
    expect(txOps.insert).not.toHaveBeenCalled();
  });
});
