/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import { loadWeather, loadTransitAlerts, loadEvents, loadSafetyReports, loadSummary } from './reads.js';

function createMockDb(rows: any[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };

  // When no limit() is called (e.g. for arrays), resolve from where/orderBy
  chain.where.mockImplementation(() => {
    const next = {
      orderBy: vi.fn().mockImplementation(() => {
        const orderNext = { limit: vi.fn().mockResolvedValue(rows) };
        // Also resolve as array directly (for queries without limit)
        Object.assign(orderNext, { then: (resolve: any) => resolve(rows) });
        return orderNext;
      }),
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: any) => resolve(rows),
    };
    return next;
  });

  const db = {
    select: vi.fn().mockReturnValue(chain),
  };

  return db as any;
}

describe('DB reads', () => {
  it('loadWeather returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadWeather(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadWeather returns WeatherData from row', async () => {
    const db = createMockDb([{
      current: { temp: 10 },
      hourly: [{ time: 'now' }],
      daily: [{ date: 'today' }],
      alerts: [],
    }]);
    const result = await loadWeather(db, 'berlin');
    expect(result).not.toBeNull();
    expect(result!.current).toEqual({ temp: 10 });
  });

  it('loadTransitAlerts returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadTransitAlerts(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadTransitAlerts maps rows to TransitAlert[]', async () => {
    const db = createMockDb([
      { id: 1, externalId: 'ext1', line: 'U2', type: 'disruption', severity: 'high', message: 'Test', detail: 'Test detail', station: 'Alexanderplatz', lat: 52.52, lon: 13.41, affectedStops: ['A', 'B'] },
    ]);
    const result = await loadTransitAlerts(db, 'berlin');
    expect(result).toHaveLength(1);
    expect(result![0].line).toBe('U2');
    expect(result![0].id).toBe('ext1');
  });

  it('loadEvents returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadEvents(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadEvents maps rows to CityEvent[]', async () => {
    const db = createMockDb([
      { hash: 'h1', title: 'Concert', venue: 'Hall', date: new Date('2026-03-03'), endDate: null, category: 'music', url: 'https://x.com', description: null, free: true },
    ]);
    const result = await loadEvents(db, 'berlin');
    expect(result).toHaveLength(1);
    expect(result![0].title).toBe('Concert');
    expect(result![0].id).toBe('h1');
  });

  it('loadSafetyReports returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadSafetyReports(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadSafetyReports maps rows to SafetyReport[]', async () => {
    const db = createMockDb([
      { hash: 'h1', title: 'Report', description: 'Test', publishedAt: new Date('2026-03-01'), url: 'https://x.com', district: 'Mitte' },
    ]);
    const result = await loadSafetyReports(db, 'berlin');
    expect(result).toHaveLength(1);
    expect(result![0].district).toBe('Mitte');
  });

  it('loadSummary returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadSummary(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadSummary maps row to NewsSummary', async () => {
    const db = createMockDb([
      { summary: 'Briefing text', generatedAt: new Date('2026-03-02'), headlineHash: 'abc' },
    ]);
    const result = await loadSummary(db, 'berlin');
    expect(result).not.toBeNull();
    expect(result!.briefing).toBe('Briefing text');
    expect(result!.cached).toBe(true);
    expect(result!.headlineHash).toBe('abc');
  });
});
