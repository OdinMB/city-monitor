import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveWeather, saveTransitAlerts, saveEvents, saveSafetyReports, saveSummary, saveAirQualityGrid } from './writes.js';
import type { Db } from './index.js';
import type { WeatherData } from '../cron/ingest-weather.js';
import type { TransitAlert } from '../cron/ingest-transit.js';
import type { CityEvent } from '../cron/ingest-events.js';
import type { SafetyReport } from '../cron/ingest-safety.js';

function createMockDb() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  // Also resolve directly for non-upsert inserts
  values.mockImplementation(() => ({
    onConflictDoUpdate,
    then: (resolve: (v: unknown) => void) => resolve(undefined),
  }));
  const insert = vi.fn().mockReturnValue({ values });

  const db = { insert } as unknown as Db;
  return { db, insert, values, onConflictDoUpdate };
}

describe('DB writes', () => {
  let db: Db;
  let insert: ReturnType<typeof vi.fn>;
  let values: ReturnType<typeof vi.fn>;
  let onConflictDoUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    insert = mock.insert;
    values = mock.values;
    onConflictDoUpdate = mock.onConflictDoUpdate;
  });

  it('saveWeather inserts a new snapshot row', async () => {
    const data = {
      current: { temp: 10 },
      hourly: [{ time: 'now', temp: 10 }],
      daily: [{ date: 'today' }],
      alerts: [],
    };

    await saveWeather(db, 'berlin', data as unknown as WeatherData);
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
  });

  it('saveTransitAlerts inserts disruptions', async () => {
    const alerts = [
      { id: '1', line: 'U2', type: 'disruption', severity: 'high', message: 'Test', detail: 'Test detail', station: 'Alexanderplatz', location: { lat: 52.52, lon: 13.41 }, affectedStops: [] },
    ];

    await saveTransitAlerts(db, 'berlin', alerts as unknown as TransitAlert[]);
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
  });

  it('saveTransitAlerts skips insert when alerts array is empty', async () => {
    await saveTransitAlerts(db, 'berlin', []);
    expect(insert).not.toHaveBeenCalled();
  });

  it('saveEvents upserts events', async () => {
    const items = [
      { id: '1', title: 'Test', date: '2026-03-03T19:00:00Z', category: 'music', url: 'https://example.com', source: 'kulturdaten' },
    ];

    await saveEvents(db, 'berlin', 'kulturdaten', items as unknown as CityEvent[]);
    expect(insert).toHaveBeenCalledOnce();
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it('saveSafetyReports upserts reports', async () => {
    const reports = [
      { id: '1', title: 'Report', description: 'Test', publishedAt: '2026-03-01T00:00:00Z', url: 'https://example.com' },
    ];

    await saveSafetyReports(db, 'berlin', reports as unknown as SafetyReport[]);
    expect(insert).toHaveBeenCalledOnce();
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it('saveSummary inserts a new summary row', async () => {
    const summary = { briefing: 'Test briefing', headlineCount: 5, headlineHash: 'abc123' };

    await saveSummary(db, 'berlin', 'de', summary, 'gpt-4.1-mini', { input: 100, output: 50 });
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
  });

  it('saveAirQualityGrid inserts grid points', async () => {
    const points = [
      { lat: 52.52, lon: 13.41, europeanAqi: 42, station: 'Berlin Mitte', url: 'https://example.com' },
      { lat: 52.48, lon: 13.35, europeanAqi: 35, station: 'Steglitz' },
    ];

    await saveAirQualityGrid(db, 'berlin', points);
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
  });

  it('saveAirQualityGrid skips insert when points array is empty', async () => {
    await saveAirQualityGrid(db, 'berlin', []);
    expect(insert).not.toHaveBeenCalled();
  });
});
