import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { TrafficCountData } from '@city-monitor/shared';

describe('Traffic counts API', () => {
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

  it('GET /api/berlin/traffic-counts returns empty data for a city without counters', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/traffic-counts`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('GET /api/hamburg/traffic-counts returns the cached sites, which bootstrap leaves out', async () => {
    const data: TrafficCountData = {
      sites: [{
        id: 'car-0113', mode: 'car', site: '0113', name: 'Shanghaiallee / Überseeallee', lat: 53.54107, lon: 10.00377,
        hour: '2026-11-02T23:00:00.000Z', count: 64, typical: 137, counters: 3,
      }],
      updated: '2026-11-03T01:45:00.000Z',
    };
    appContext.cache.set('hamburg:traffic-counts', data, 60);

    const res = await fetch(`${baseUrl}/api/hamburg/traffic-counts`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/hamburg/bootstrap`)).json();
    expect(boot).not.toHaveProperty('trafficCounts');
  });

  it('GET /api/unknown/traffic-counts returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/traffic-counts`);
    expect(res.status).toBe(404);
  });
});
