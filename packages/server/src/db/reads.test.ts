import { describe, it, expect, vi } from 'vitest';
import { loadWeather, loadTransitAlerts, loadEvents, loadSafetyReports, loadSummary, loadAirQualityGrid } from './reads.js';
import type { Db } from './index.js';

/**
 * Creates a mock Db that supports two query patterns:
 * 1. Snapshot reads: select().from().where().orderBy().limit() → rows
 * 2. Latest-batch reads: select({ val: max() }).from().where() → [{ val: Date }],
 *    then select().from().where() → rows
 */
function createMockDb(rows: Record<string, unknown>[] = []) {
  const maxDate = new Date(); // Must be recent to pass staleness guards

  function makeChain(resolveWith: unknown) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(resolveWith);
    // Support direct await (for queries without .limit())
    Object.defineProperty(chain, 'then', {
      value: (resolve: (v: unknown) => void) => resolve(resolveWith),
      writable: true,
    });
    return chain;
  }

  const db = {
    select: vi.fn().mockImplementation((cols?: Record<string, unknown>) => {
      if (cols && Object.keys(cols).length > 0) {
        // MAX(fetched_at) subquery: return date if rows exist, null otherwise
        return makeChain(rows.length > 0 ? [{ val: maxDate }] : [{ val: null }]);
      }
      return makeChain(rows);
    }),
  };

  return db as unknown as Db;
}

describe('DB reads', () => {
  it('loadWeather returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadWeather(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadWeather returns WeatherData from row', async () => {
    const db = createMockDb([{
      current: { temp: 10, feelsLike: 8, humidity: 65, precipitation: 0, weatherCode: 3, windSpeed: 12, windDirection: 270 },
      hourly: [{ time: '2026-03-03T12:00', temp: 10, precipProb: 20, weatherCode: 3 }],
      daily: [{ date: '2026-03-03', high: 12, low: 5, weatherCode: 3, precip: 0.5, sunrise: '06:30', sunset: '18:00' }],
      alerts: [],
    }]);
    const result = await loadWeather(db, 'berlin');
    expect(result).not.toBeNull();
    expect(result!.current.temp).toBe(10);
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
      { hash: 'h1', title: 'Concert', venue: 'Hall', date: new Date('2026-03-03'), endDate: null, category: 'music', url: 'https://x.com', description: null, free: true, source: 'ticketmaster', price: '29–89 EUR', fetchedAt: new Date() },
    ]);
    const result = await loadEvents(db, 'berlin');
    expect(result).toHaveLength(1);
    expect(result![0].title).toBe('Concert');
    expect(result![0].id).toBe('h1');
    expect(result![0].source).toBe('ticketmaster');
    expect(result![0].price).toBe('29–89 EUR');
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

  it('loadSummary maps rows to multi-lang NewsSummary', async () => {
    const db = createMockDb([
      { lang: 'de', summary: 'Deutsche Zusammenfassung', generatedAt: new Date('2026-03-02'), headlineHash: 'abc' },
    ]);
    const result = await loadSummary(db, 'berlin');
    expect(result).not.toBeNull();
    expect(result!.briefings['de']).toBe('Deutsche Zusammenfassung');
    expect(result!.cached).toBe(true);
    expect(result!.headlineHash).toBe('abc');
  });

  it('loadAirQualityGrid returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadAirQualityGrid(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadAirQualityGrid maps rows to AirQualityGridPoint[]', async () => {
    const db = createMockDb([
      { lat: 52.52, lon: 13.41, europeanAqi: 42, station: 'Berlin Mitte', url: 'https://example.com' },
      { lat: 52.48, lon: 13.35, europeanAqi: 35, station: 'Steglitz', url: null },
    ]);
    const result = await loadAirQualityGrid(db, 'berlin');
    expect(result).toHaveLength(2);
    expect(result![0].europeanAqi).toBe(42);
    expect(result![0].station).toBe('Berlin Mitte');
    expect(result![0].url).toBe('https://example.com');
    expect(result![1].url).toBeUndefined();
  });
});
