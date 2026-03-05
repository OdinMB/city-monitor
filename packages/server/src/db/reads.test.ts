import { describe, it, expect, vi } from 'vitest';
import { loadWeather, loadTransitAlerts, loadEvents, loadSafetyReports, loadSummary, loadAirQualityGrid, loadPollen, loadNoiseSensors } from './reads.js';
import type { Db } from './index.js';

/**
 * Creates a mock Db that supports the unified snapshots pattern:
 * select().from(snapshots).where(...).orderBy(...).limit(1) → rows
 *
 * Also supports non-snapshot tables (events, safety, news, summaries):
 * select().from(table).where(...).orderBy(...).limit(...) → rows
 */
function createMockDb(rows: Record<string, unknown>[] = []) {
  function makeChain(resolveWith: unknown) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(resolveWith);
    chain.groupBy = vi.fn().mockReturnValue(chain);
    // Support direct await (for queries without .limit())
    Object.defineProperty(chain, 'then', {
      value: (resolve: (v: unknown) => void) => resolve(resolveWith),
      writable: true,
    });
    return chain;
  }

  const db = {
    select: vi.fn().mockImplementation(() => makeChain(rows)),
  };

  return db as unknown as Db;
}

describe('DB reads', () => {
  it('loadWeather returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadWeather(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadWeather returns DbResult with WeatherData', async () => {
    const db = createMockDb([{
      data: {
        current: { temp: 10, feelsLike: 8, humidity: 65, precipitation: 0, weatherCode: 3, windSpeed: 12, windDirection: 270 },
        hourly: [{ time: '2026-03-03T12:00', temp: 10, precipProb: 20, weatherCode: 3 }],
        daily: [{ date: '2026-03-03', high: 12, low: 5, weatherCode: 3, precip: 0.5, sunrise: '06:30', sunset: '18:00' }],
        alerts: [],
      },
      fetchedAt: new Date(),
    }]);
    const result = await loadWeather(db, 'berlin');
    expect(result).not.toBeNull();
    expect(result!.data.current.temp).toBe(10);
    expect(result!.fetchedAt).toBeInstanceOf(Date);
  });

  it('loadWeather returns stale data instead of discarding it', async () => {
    const staleDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
    const db = createMockDb([{
      data: {
        current: { temp: 5, feelsLike: 2, humidity: 80, precipitation: 1, weatherCode: 61, windSpeed: 20, windDirection: 180 },
        hourly: [{ time: '2026-03-02T12:00', temp: 5, precipProb: 80, weatherCode: 61 }],
        daily: [{ date: '2026-03-02', high: 7, low: 1, weatherCode: 61, precip: 5, sunrise: '06:45', sunset: '17:50' }],
        alerts: [],
      },
      fetchedAt: staleDate,
    }]);
    const result = await loadWeather(db, 'berlin');
    expect(result).not.toBeNull();
    expect(result!.data.current.temp).toBe(5);
    expect(result!.fetchedAt).toEqual(staleDate);
  });

  it('loadWeather preserves UV fields from DB', async () => {
    const db = createMockDb([{
      data: {
        current: { temp: 10, feelsLike: 8, humidity: 65, precipitation: 0, weatherCode: 3, windSpeed: 12, windDirection: 270, uvIndex: 6.5, uvIndexClearSky: 7.2 },
        hourly: [{ time: '2026-03-03T12:00', temp: 10, precipProb: 20, weatherCode: 3, uvIndex: 5.1 }],
        daily: [{ date: '2026-03-03', high: 12, low: 5, weatherCode: 3, precip: 0.5, sunrise: '06:30', sunset: '18:00', uvIndexMax: 7.0, uvIndexClearSkyMax: 8.1 }],
        alerts: [],
      },
      fetchedAt: new Date(),
    }]);
    const result = await loadWeather(db, 'berlin');
    expect(result).not.toBeNull();
    expect(result!.data.current.uvIndex).toBe(6.5);
    expect(result!.data.current.uvIndexClearSky).toBe(7.2);
    expect(result!.data.hourly[0].uvIndex).toBe(5.1);
    expect(result!.data.daily[0].uvIndexMax).toBe(7.0);
    expect(result!.data.daily[0].uvIndexClearSkyMax).toBe(8.1);
  });

  it('loadTransitAlerts returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadTransitAlerts(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadTransitAlerts returns DbResult<TransitAlert[]> from snapshot', async () => {
    const db = createMockDb([{
      data: [
        { id: 'ext1', line: 'U2', lines: ['U2'], type: 'disruption', severity: 'high', message: 'Test', detail: 'Test detail', station: 'Alexanderplatz', location: { lat: 52.52, lon: 13.41 }, affectedStops: ['A', 'B'] },
      ],
      fetchedAt: new Date(),
    }]);
    const result = await loadTransitAlerts(db, 'berlin');
    expect(result!.data).toHaveLength(1);
    expect(result!.data[0].line).toBe('U2');
    expect(result!.data[0].id).toBe('ext1');
  });

  it('loadEvents returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadEvents(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadEvents maps rows to DbResult<CityEvent[]>', async () => {
    const db = createMockDb([
      { hash: 'h1', title: 'Concert', venue: 'Hall', date: new Date('2026-03-03'), endDate: null, category: 'music', url: 'https://x.com', description: null, free: true, source: 'ticketmaster', price: '29–89 EUR', fetchedAt: new Date() },
    ]);
    const result = await loadEvents(db, 'berlin');
    expect(result!.data).toHaveLength(1);
    expect(result!.data[0].title).toBe('Concert');
    expect(result!.data[0].id).toBe('h1');
    expect(result!.data[0].source).toBe('ticketmaster');
    expect(result!.data[0].price).toBe('29–89 EUR');
  });

  it('loadSafetyReports returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadSafetyReports(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadSafetyReports maps rows to DbResult<SafetyReport[]>', async () => {
    const db = createMockDb([
      { hash: 'h1', title: 'Report', description: 'Test', publishedAt: new Date('2026-03-01'), url: 'https://x.com', district: 'Mitte', fetchedAt: new Date() },
    ]);
    const result = await loadSafetyReports(db, 'berlin');
    expect(result!.data).toHaveLength(1);
    expect(result!.data[0].district).toBe('Mitte');
  });

  it('loadSummary returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadSummary(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadSummary maps rows to DbResult with multi-lang NewsSummary', async () => {
    const db = createMockDb([
      { lang: 'de', summary: 'Deutsche Zusammenfassung', generatedAt: new Date('2026-03-02'), headlineHash: 'abc' },
    ]);
    const result = await loadSummary(db, 'berlin');
    expect(result).not.toBeNull();
    expect(result!.data.briefings['de']).toBe('Deutsche Zusammenfassung');
    expect(result!.data.cached).toBe(true);
    expect(result!.data.headlineHash).toBe('abc');
  });

  it('loadAirQualityGrid returns null when no rows', async () => {
    const db = createMockDb([]);
    const result = await loadAirQualityGrid(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadAirQualityGrid returns DbResult<AirQualityGridPoint[]> from snapshot', async () => {
    const db = createMockDb([{
      data: [
        { lat: 52.52, lon: 13.41, europeanAqi: 42, station: 'Berlin Mitte', url: 'https://example.com' },
        { lat: 52.48, lon: 13.35, europeanAqi: 35, station: 'Steglitz' },
      ],
      fetchedAt: new Date(),
    }]);
    const result = await loadAirQualityGrid(db, 'berlin');
    expect(result!.data).toHaveLength(2);
    expect(result!.data[0].europeanAqi).toBe(42);
    expect(result!.data[0].station).toBe('Berlin Mitte');
    expect(result!.data[0].url).toBe('https://example.com');
    expect(result!.data[1].url).toBeUndefined();
  });

  it('loadPollen returns null when data is stale (maxAgeMs guard)', async () => {
    const staleDate = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72h ago, exceeds 48h guard
    const db = createMockDb([{
      data: {
        region: 'Berlin',
        updatedAt: staleDate.toISOString(),
        pollen: {
          Hasel: { today: '0', tomorrow: '0', dayAfterTomorrow: '0' },
          Erle: { today: '0', tomorrow: '0', dayAfterTomorrow: '0' },
          Esche: { today: '0', tomorrow: '0', dayAfterTomorrow: '0' },
          Birke: { today: '0', tomorrow: '0', dayAfterTomorrow: '0' },
          Graeser: { today: '0', tomorrow: '0', dayAfterTomorrow: '0' },
          Roggen: { today: '0', tomorrow: '0', dayAfterTomorrow: '0' },
          Beifuss: { today: '0', tomorrow: '0', dayAfterTomorrow: '0' },
          Ambrosia: { today: '0', tomorrow: '0', dayAfterTomorrow: '0' },
        },
      },
      fetchedAt: staleDate,
    }]);
    const result = await loadPollen(db, 'berlin');
    expect(result).toBeNull();
  });

  it('loadNoiseSensors returns null when data is stale (maxAgeMs guard)', async () => {
    const staleDate = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4h ago, exceeds 2h guard
    const db = createMockDb([{
      data: [{ id: 1, lat: 52.5, lon: 13.4, laeq: 55, laMin: 40, laMax: 70 }],
      fetchedAt: staleDate,
    }]);
    const result = await loadNoiseSensors(db, 'berlin');
    expect(result).toBeNull();
  });
});
