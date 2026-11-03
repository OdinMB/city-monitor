import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { WaterTemperatureData } from '@city-monitor/shared';

describe('Water temperature API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
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

  it('GET /api/hamburg/water-temperature returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/hamburg/water-temperature`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('GET /api/berlin/water-temperature returns the cached readings, which bootstrap leaves out', async () => {
    const data: WaterTemperatureData = {
      stations: [{
        id: '139', name: 'Fischerinsel', waterBody: 'Spree', lat: 52.51393, lon: 13.41077, temperature: 10.6,
        measuredAt: '2026-11-03T02:00:00+01:00', url: 'https://wasserportal.berlin.de/station.php?anzeige=g&thema=owt&station=139',
      }],
    };
    appContext.cache.set('berlin:water-temperature', data, 60);

    const res = await fetch(`${baseUrl}/api/berlin/water-temperature`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/berlin/bootstrap`)).json();
    expect(boot).not.toHaveProperty('waterTemperature');
  });

  it('GET /api/unknown/water-temperature returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/water-temperature`);
    expect(res.status).toBe(404);
  });
});
