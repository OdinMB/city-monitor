import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import express from 'express';
import type { AirQuality, AirQualityGridPoint } from '@city-monitor/shared';
import type { Db } from '../db/index.js';
import { createCache } from '../lib/cache.js';
import { CK } from '../lib/cache-keys.js';
import { getCityConfig } from '../config/index.js';
import { createAirQualityRouter } from './air-quality.js';
import { createBootstrapRouter } from './bootstrap.js';

vi.mock('../db/reads.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/reads.js')>()),
  loadAirQualityGrid: vi.fn(),
}));
vi.mock('../db/writes.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/writes.js')>()),
  saveAirQualityGrid: vi.fn(),
}));

import { loadAirQualityGrid } from '../db/reads.js';

const OPEN_METEO = 'https://air-quality-api.open-meteo.com/';
const WAQI = 'https://api.waqi.info/';
const SENSOR_COMMUNITY = 'https://data.sensor.community/';
const CONCURRENT = 5;

const openMeteoBody = {
  current: { european_aqi: 35, pm10: 22, pm2_5: 12.5, nitrogen_dioxide: 18.3, ozone: 45 },
  hourly: { time: ['2026-10-27T10:00'], european_aqi: [35], pm2_5: [12.5], pm10: [22] },
};
const waqiBody = {
  status: 'ok',
  data: [{ lat: 52.52, lon: 13.41, uid: 1, aqi: '40', station: { name: 'Mitte', time: '' } }],
};
const storedReading: AirQuality = {
  current: { europeanAqi: 21, pm25: 6, pm10: 11, no2: 9, o3: 40, updatedAt: '2026-10-27T09:00:00Z' },
  hourly: [],
};
const storedGrid: AirQualityGridPoint[] = [
  { lat: 52.5, lon: 13.3, europeanAqi: 18, station: 'Charlottenburg', url: 'https://maps.sensor.community/#17/52.5/13.3' },
];

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const failure = () => new Response('', { status: 500 });

/** Upstream calls one grid run makes when every Sensor.Community candidate fails. */
const scCandidatesPerRun = getCityConfig('berlin')!.dataSources.airQuality!.sensorCommunityStations!
  .reduce((n, s) => n + 1 + (s.fallbackIds?.length ?? 0), 0);

describe('Air quality routes — filling an empty cache from upstream', () => {
  let server: Server;
  let baseUrl: string;
  const cache = createCache();
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    const app = express();
    app.use('/api', createAirQualityRouter(cache, {} as Db));
    app.use('/api', createBootstrapRouter(cache));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
  });

  beforeEach(() => {
    cache.clear();
    vi.mocked(loadAirQualityGrid).mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * Stands in for every upstream host and counts the calls. With `hold`, calls
   * to that host wait until CONCURRENT of them arrived, `release` is called or
   * `graceMs` passed, so concurrent requests overlap the way visitors' do while
   * a provider is slow.
   */
  function stubUpstream(respond: (url: string) => Response, hold?: string, graceMs = 300) {
    const calls: string[] = [];
    const callsTo = (host: string) => calls.filter((u) => u.startsWith(host)).length;
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    setTimeout(release, graceMs);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      calls.push(url);
      if (hold && url.startsWith(hold)) {
        if (callsTo(hold) >= CONCURRENT) release();
        await released;
      }
      return respond(url);
    });
    return { callsTo, total: () => calls.length, release };
  }

  async function get(path: string) {
    const res = await fetch(`${baseUrl}/api${path}`);
    return { status: res.status, body: await res.json() };
  }

  const getConcurrently = (path: string) => Promise.all(Array.from({ length: CONCURRENT }, () => get(path)));

  describe('GET /api/:city/air-quality', () => {
    it('serves the cached reading without calling Open-Meteo', async () => {
      cache.set(CK.airQuality('berlin'), storedReading, 3600);
      const upstream = stubUpstream(failure);

      const { status, body } = await get('/berlin/air-quality');

      expect(status).toBe(200);
      expect(body.data).toEqual(storedReading);
      expect(upstream.total()).toBe(0);
    });

    it('fetches Open-Meteo on a miss and serves the reading', async () => {
      const upstream = stubUpstream(() => json(openMeteoBody));

      const { status, body } = await get('/berlin/air-quality');

      expect(status).toBe(200);
      expect(body.data.current.europeanAqi).toBe(35);
      expect(body.data.hourly).toHaveLength(1);
      expect(typeof body.fetchedAt).toBe('string');
      expect(upstream.callsTo(OPEN_METEO)).toBe(1);
    });

    it('concurrent misses share one Open-Meteo call and get the same reading', async () => {
      const upstream = stubUpstream(() => json(openMeteoBody), OPEN_METEO);

      const responses = await getConcurrently('/berlin/air-quality');

      expect(upstream.callsTo(OPEN_METEO)).toBe(1);
      expect(responses[0].status).toBe(200);
      expect(responses[0].body.data.current.europeanAqi).toBe(35);
      for (const r of responses) expect(r).toEqual(responses[0]);
    });

    it('concurrent misses while Open-Meteo fails share one call and all get the empty body', async () => {
      const upstream = stubUpstream(failure, OPEN_METEO);

      const responses = await getConcurrently('/berlin/air-quality');

      expect(upstream.callsTo(OPEN_METEO)).toBe(1);
      for (const r of responses) expect(r).toEqual({ status: 200, body: { data: null, fetchedAt: null } });
    });

    it('does not call Open-Meteo again for 30 s after a failure, then retries', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
      const upstream = stubUpstream(failure);

      expect((await get('/berlin/air-quality')).body).toEqual({ data: null, fetchedAt: null });
      expect(upstream.callsTo(OPEN_METEO)).toBe(1);

      vi.setSystemTime(new Date('2026-10-27T10:00:29Z'));
      expect((await get('/berlin/air-quality')).body).toEqual({ data: null, fetchedAt: null });
      expect(upstream.callsTo(OPEN_METEO)).toBe(1);

      vi.setSystemTime(new Date('2026-10-27T10:00:31Z'));
      expect((await get('/berlin/air-quality')).body).toEqual({ data: null, fetchedAt: null });
      expect(upstream.callsTo(OPEN_METEO)).toBe(2);
    });

    it('leaves the bootstrap air-quality slot empty after a failed call', async () => {
      stubUpstream(failure);

      await get('/berlin/air-quality');

      expect((await get('/berlin/bootstrap')).body.airQuality).toBeNull();
    });

    it('keeps a reading the weather job stored while the failed call was in flight, with its own fetchedAt', async () => {
      const storedAt = new Date('2026-10-27T09:00:00Z');
      const upstream = stubUpstream(() => {
        cache.set(CK.airQuality('berlin'), storedReading, 3600, storedAt);
        return failure();
      });

      const expected = { status: 200, body: { data: storedReading, fetchedAt: storedAt.toISOString() } };
      expect(await get('/berlin/air-quality')).toEqual(expected);
      expect(await get('/berlin/air-quality')).toEqual(expected);
      expect(upstream.callsTo(OPEN_METEO)).toBe(1);
    });
  });

  describe('GET /api/:city/air-quality/grid', () => {
    it('returns 404 for an unknown city without calling upstream', async () => {
      const upstream = stubUpstream(failure);

      expect((await get('/unknown/air-quality/grid')).status).toBe(404);
      expect(upstream.total()).toBe(0);
    });

    it('serves the cached grid without reading the database or calling upstream', async () => {
      cache.set(CK.airQualityGrid('berlin'), storedGrid, 2160);
      const upstream = stubUpstream(failure);

      const { status, body } = await get('/berlin/air-quality/grid');

      expect(status).toBe(200);
      expect(body.data).toEqual(storedGrid);
      expect(loadAirQualityGrid).not.toHaveBeenCalled();
      expect(upstream.total()).toBe(0);
    });

    it('serves the stored grid with its own fetchedAt before calling upstream', async () => {
      const fetchedAt = new Date('2026-10-27T09:45:00Z');
      vi.mocked(loadAirQualityGrid).mockResolvedValue({ data: storedGrid, fetchedAt });
      const upstream = stubUpstream(failure);

      const { body } = await get('/berlin/air-quality/grid');

      expect(body).toEqual({ data: storedGrid, fetchedAt: fetchedAt.toISOString() });
      expect(upstream.total()).toBe(0);
    });

    it('fetches WAQI and Sensor.Community when nothing is stored, and serves the grid', async () => {
      const upstream = stubUpstream((url) => (url.startsWith(WAQI) ? json(waqiBody) : failure()));

      const { status, body } = await get('/berlin/air-quality/grid');

      expect(status).toBe(200);
      expect(body.data).toEqual([
        { lat: 52.52, lon: 13.41, europeanAqi: 40, station: 'Mitte', url: 'https://aqicn.org/station/@1/' },
      ]);
      expect(typeof body.fetchedAt).toBe('string');
      expect(upstream.callsTo(WAQI)).toBe(1);
    });

    it('concurrent misses share one upstream run and get the same grid', async () => {
      const upstream = stubUpstream((url) => (url.startsWith(WAQI) ? json(waqiBody) : failure()), WAQI);

      const responses = await getConcurrently('/berlin/air-quality/grid');

      expect(upstream.callsTo(WAQI)).toBe(1);
      expect(upstream.callsTo(SENSOR_COMMUNITY)).toBe(scCandidatesPerRun);
      expect(responses[0].body.data).toHaveLength(1);
      for (const r of responses) expect(r).toEqual(responses[0]);
    });

    it('concurrent misses while every provider fails share one run, get the empty grid, and the failure is remembered', async () => {
      const upstream = stubUpstream(failure, WAQI);

      const responses = await getConcurrently('/berlin/air-quality/grid');

      expect(upstream.callsTo(WAQI)).toBe(1);
      expect(upstream.callsTo(SENSOR_COMMUNITY)).toBe(scCandidatesPerRun);
      for (const r of responses) expect(r).toEqual({ status: 200, body: { data: [], fetchedAt: null } });

      expect((await get('/berlin/air-quality/grid')).body).toEqual({ data: [], fetchedAt: null });
      expect(upstream.total()).toBe(1 + scCandidatesPerRun);
    });

    it('keeps the stored grid\'s fetchedAt when a concurrent request\'s DB read failed and its run fails', async () => {
      const storedAt = new Date('2026-10-27T05:00:00Z');
      vi.mocked(loadAirQualityGrid)
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValue({ data: storedGrid, fetchedAt: storedAt });
      const upstream = stubUpstream(failure, WAQI, 10_000);
      const expected = { status: 200, body: { data: storedGrid, fetchedAt: storedAt.toISOString() } };

      // First request: DB read throws, so it starts a run that hangs on WAQI
      const first = get('/berlin/air-quality/grid');
      await vi.waitFor(() => expect(upstream.callsTo(WAQI)).toBe(1));
      // Second request: DB read succeeds and stores the saved grid
      expect(await get('/berlin/air-quality/grid')).toEqual(expected);
      // The first run then fails
      upstream.release();

      expect(await first).toEqual(expected);
      expect(await get('/berlin/air-quality/grid')).toEqual(expected);
      expect(upstream.callsTo(WAQI)).toBe(1);
    });

    it('still serves a grid that reaches the database after a failed run', async () => {
      const upstream = stubUpstream(failure);
      await get('/berlin/air-quality/grid');

      const fetchedAt = new Date('2026-10-27T10:00:30Z');
      vi.mocked(loadAirQualityGrid).mockResolvedValue({ data: storedGrid, fetchedAt });

      expect((await get('/berlin/air-quality/grid')).body).toEqual({ data: storedGrid, fetchedAt: fetchedAt.toISOString() });
      expect(upstream.callsTo(WAQI)).toBe(1);
    });
  });
});
