import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { AirQualityStation } from '@city-monitor/shared';

describe('Air quality stations API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,koeln');
    appContext = await createApp({ skipScheduler: true });
    await new Promise<void>((resolve) => {
      server = appContext.app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    vi.unstubAllEnvs();
  });

  it('GET /api/koeln/air-quality/stations returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/koeln/air-quality/stations`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=600');
  });

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const stationsAt = (measuredAt: string): AirQualityStation[] => [{
    code: 'DENW211', name: 'Köln Clevischer Ring', lat: 50.9643, lon: 7.0049, setting: 'traffic', network: 'NW',
    measuredAt, index: 2, no2: 39, pm10: 23, pm25: 20, o3: null,
  }];
  const waqi = { lat: 50.94, lon: 6.95, europeanAqi: 45, station: 'Köln Chorweiler', url: 'https://aqicn.org/station/@7/' };
  const sensor = { lat: 50.9, lon: 6.9, europeanAqi: 30, station: 'X', url: 'https://maps.sensor.community/#17/50.9/6.9' };

  it('GET /api/koeln/air-quality/stations returns the cached stations while fresh, also in bootstrap', async () => {
    const stations = stationsAt(hoursAgo(1.5));
    appContext.cache.set('koeln:air-quality:stations', stations, 60);

    const res = await fetch(`${baseUrl}/api/koeln/air-quality/stations`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(stations);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/koeln/bootstrap`)).json();
    expect(boot.airQualityStations.data).toEqual(stations);
  });

  it('with fresh UBA readings, serves the grid without any WAQI point', async () => {
    appContext.cache.set('koeln:air-quality:stations', stationsAt(hoursAgo(1.5)), 60);
    appContext.cache.set('koeln:air-quality:grid', [waqi, sensor], 60);

    const body = await (await fetch(`${baseUrl}/api/koeln/air-quality/grid`)).json();
    expect(body.data).toEqual([sensor]);
  });

  it('with stale UBA readings, serves no stations and the whole WAQI grid', async () => {
    appContext.cache.set('koeln:air-quality:stations', stationsAt(hoursAgo(5)), 60);
    appContext.cache.set('koeln:air-quality:grid', [waqi, sensor], 60);

    expect(await (await fetch(`${baseUrl}/api/koeln/air-quality/stations`)).json()).toEqual({ data: null, fetchedAt: null });
    expect((await (await fetch(`${baseUrl}/api/koeln/bootstrap`)).json()).airQualityStations).toBeNull();
    expect((await (await fetch(`${baseUrl}/api/koeln/air-quality/grid`)).json()).data).toEqual([waqi, sensor]);
  });

  it('without UBA readings, serves the whole WAQI grid', async () => {
    appContext.cache.delete('koeln:air-quality:stations');
    appContext.cache.set('koeln:air-quality:grid', [waqi, sensor], 60);
    expect((await (await fetch(`${baseUrl}/api/koeln/air-quality/grid`)).json()).data).toEqual([waqi, sensor]);
  });

  it('GET /api/unknown/air-quality/stations returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/air-quality/stations`);
    expect(res.status).toBe(404);
  });
});
