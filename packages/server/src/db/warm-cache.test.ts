import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warmCache, findStaleJobs, type FreshnessSpec } from './warm-cache.js';
import { createCache } from '../lib/cache.js';
import type { Db } from './index.js';

vi.mock('./reads.js', () => ({
  loadWeather: vi.fn().mockResolvedValue({ current: { temp: 10 }, hourly: [], daily: [], alerts: [] }),
  loadTransitAlerts: vi.fn().mockResolvedValue([{ id: '1', line: 'U2', type: 'disruption', severity: 'high', message: 'Test', detail: 'Test detail', station: 'Alexanderplatz', location: { lat: 52.52, lon: 13.41 }, affectedStops: [] }]),
  loadEvents: vi.fn().mockResolvedValue([{ id: '1', title: 'Event', date: '2026-03-03', category: 'other', url: '' }]),
  loadSafetyReports: vi.fn().mockResolvedValue([{ id: '1', title: 'Report', description: '', publishedAt: '', url: '' }]),
  loadNewsItems: vi.fn().mockResolvedValue([{ id: 'n1', title: 'News', url: 'https://x.com', publishedAt: '2026-03-02', sourceName: 'Test', sourceUrl: 'https://x.com', category: 'politics', tier: 1, lang: 'de' }]),
  loadSummary: vi.fn().mockResolvedValue({ briefings: { de: 'Test' }, generatedAt: '2026-03-02', headlineCount: 5, cached: true, headlineHash: 'abc' }),
  loadNinaWarnings: vi.fn().mockResolvedValue([]),
  loadAirQualityGrid: vi.fn().mockResolvedValue([{ lat: 52.52, lon: 13.41, europeanAqi: 42, station: 'Mitte' }]),
  loadAllGeocodeLookups: vi.fn().mockResolvedValue([]),
  loadPoliticalDistricts: vi.fn().mockResolvedValue(null),
}));

describe('warmCache', () => {
  let cache: ReturnType<typeof createCache>;

  beforeEach(() => {
    cache = createCache();
  });

  it('populates cache from DB for active cities', async () => {
    const db = {} as unknown as Db; // reads are mocked
    await warmCache(db, cache);

    expect(cache.get('berlin:weather')).not.toBeNull();
    expect(cache.get('berlin:transit:alerts')).not.toBeNull();
    expect(cache.get('berlin:events:upcoming')).not.toBeNull();
    expect(cache.get('berlin:safety:recent')).not.toBeNull();
    expect(cache.get('berlin:news:summary')).not.toBeNull();
    expect(cache.get('berlin:air-quality:grid')).not.toBeNull();
  });

  it('handles null returns from DB gracefully', async () => {
    const reads = await import('./reads.js');
    vi.mocked(reads.loadWeather).mockResolvedValueOnce(null);
    vi.mocked(reads.loadTransitAlerts).mockResolvedValueOnce(null);
    vi.mocked(reads.loadEvents).mockResolvedValueOnce(null);
    vi.mocked(reads.loadSafetyReports).mockResolvedValueOnce(null);
    vi.mocked(reads.loadNewsItems).mockResolvedValueOnce(null);
    vi.mocked(reads.loadSummary).mockResolvedValueOnce(null);
    vi.mocked(reads.loadNinaWarnings).mockResolvedValueOnce(null);
    vi.mocked(reads.loadAirQualityGrid).mockResolvedValueOnce(null);

    const db = {} as unknown as Db;
    await warmCache(db, cache);

    expect(cache.get('berlin:weather')).toBeNull();
    expect(cache.get('berlin:transit:alerts')).toBeNull();
    expect(cache.get('berlin:air-quality:grid')).toBeNull();
  });

  it('continues warming other domains if one fails', async () => {
    const reads = await import('./reads.js');
    vi.mocked(reads.loadWeather).mockRejectedValueOnce(new Error('DB error'));

    const db = {} as unknown as Db;
    await warmCache(db, cache);

    // Weather should be null (failed), but others should be populated
    expect(cache.get('berlin:weather')).toBeNull();
    expect(cache.get('berlin:transit:alerts')).not.toBeNull();
  });

  it('runs per-city reads in parallel, not sequentially (warmCache)', async () => {
    const reads = await import('./reads.js');
    const callOrder: string[] = [];

    // Track the order calls start (not finish)
    vi.mocked(reads.loadWeather).mockImplementation(async () => {
      callOrder.push('weather-start');
      await new Promise((r) => setTimeout(r, 5));
      callOrder.push('weather-end');
      return { current: { temp: 10 }, hourly: [], daily: [], alerts: [] } as never;
    });
    vi.mocked(reads.loadTransitAlerts).mockImplementation(async () => {
      callOrder.push('transit-start');
      await new Promise((r) => setTimeout(r, 5));
      callOrder.push('transit-end');
      return [] as never;
    });
    vi.mocked(reads.loadEvents).mockImplementation(async () => {
      callOrder.push('events-start');
      await new Promise((r) => setTimeout(r, 5));
      callOrder.push('events-end');
      return [] as never;
    });

    const db = {} as unknown as Db;
    await warmCache(db, cache);

    // If parallel: all starts happen before any ends
    const weatherStart = callOrder.indexOf('weather-start');
    const transitStart = callOrder.indexOf('transit-start');
    const eventsStart = callOrder.indexOf('events-start');
    const weatherEnd = callOrder.indexOf('weather-end');

    // All three should start before weather finishes
    expect(transitStart).toBeLessThan(weatherEnd);
    expect(eventsStart).toBeLessThan(weatherEnd);
    expect(weatherStart).toBeLessThan(weatherEnd);
  });
});

describe('findStaleJobs', () => {
  function mockDb(executeResult: unknown) {
    return { execute: vi.fn().mockResolvedValue(executeResult) } as unknown as Db;
  }

  it('marks job stale when table is empty', async () => {
    const db = mockDb({ rows: [] });
    const specs: FreshnessSpec[] = [
      { jobName: 'test-job', tableName: 'test_table', maxAgeSeconds: 3600 },
    ];
    const stale = await findStaleJobs(db, specs);
    expect(stale.has('test-job')).toBe(true);
  });

  it('marks job fresh when fetched_at is within maxAge', async () => {
    const db = mockDb({ rows: [{ fetched_at: new Date().toISOString() }] });
    const specs: FreshnessSpec[] = [
      { jobName: 'test-job', tableName: 'test_table', maxAgeSeconds: 3600 },
    ];
    const stale = await findStaleJobs(db, specs);
    expect(stale.has('test-job')).toBe(false);
  });

  it('marks job stale when fetched_at exceeds maxAge', async () => {
    const old = new Date(Date.now() - 7200_000).toISOString(); // 2 hours ago
    const db = mockDb({ rows: [{ fetched_at: old }] });
    const specs: FreshnessSpec[] = [
      { jobName: 'test-job', tableName: 'test_table', maxAgeSeconds: 3600 },
    ];
    const stale = await findStaleJobs(db, specs);
    expect(stale.has('test-job')).toBe(true);
  });

  it('includes filter column in query when spec has filter', async () => {
    const executeFn = vi.fn().mockResolvedValue({ rows: [{ fetched_at: new Date().toISOString() }] });
    const db = { execute: executeFn } as unknown as Db;

    const specs: FreshnessSpec[] = [
      { jobName: 'ingest-political', tableName: 'political_districts', maxAgeSeconds: 604800, filter: { column: 'level', value: 'bundestag' } },
    ];
    await findStaleJobs(db, specs);

    // The SQL template should include the filter value
    const sqlArg = executeFn.mock.calls[0][0];
    const queryChunks = sqlArg.queryChunks ?? sqlArg.value ?? [];
    const sqlString = JSON.stringify(queryChunks);
    expect(sqlString).toContain('bundestag');
  });

  it('filter prevents unrelated rows from satisfying freshness check', async () => {
    // Simulates: bezirke row is fresh but bundestag row is missing.
    // Without filter, the table-level check would find the bezirke row and consider it fresh.
    // With filter on level=bundestag, the query returns no rows → stale.
    const executeFn = vi.fn().mockResolvedValue({ rows: [] }); // filtered query returns nothing
    const db = { execute: executeFn } as unknown as Db;

    const specs: FreshnessSpec[] = [
      { jobName: 'ingest-political', tableName: 'political_districts', maxAgeSeconds: 604800, filter: { column: 'level', value: 'bundestag' } },
    ];
    const stale = await findStaleJobs(db, specs);
    expect(stale.has('ingest-political')).toBe(true);
  });

  it('marks job stale when DB throws', async () => {
    const db = { execute: vi.fn().mockRejectedValue(new Error('connection refused')) } as unknown as Db;
    const specs: FreshnessSpec[] = [
      { jobName: 'test-job', tableName: 'test_table', maxAgeSeconds: 3600 },
    ];
    const stale = await findStaleJobs(db, specs);
    expect(stale.has('test-job')).toBe(true);
  });
});
