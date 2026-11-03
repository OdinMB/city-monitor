import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { BikeSharingData } from '@city-monitor/shared';

describe('Bike sharing API', () => {
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

  it('GET /api/hamburg/bike-sharing returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/hamburg/bike-sharing`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=120');
  });

  it('GET /api/berlin/bike-sharing returns the cached stations, which bootstrap leaves out', async () => {
    const data: BikeSharingData = {
      system: 'nextbike Berlin',
      operator: 'nextbike',
      stations: [{ id: '72228', name: 'EDEKA Schmitt (S Halensee)', lat: 52.49699, lon: 13.29121, bikes: 2, docks: 6, reportedAt: 1793668211 }],
      updated: '2026-11-03T00:30:11.000Z',
    };
    appContext.cache.set('berlin:bike-sharing', data, 60);

    const res = await fetch(`${baseUrl}/api/berlin/bike-sharing`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/berlin/bootstrap`)).json();
    expect(boot).not.toHaveProperty('bikeSharing');
  });

  it('GET /api/unknown/bike-sharing returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/bike-sharing`);
    expect(res.status).toBe(404);
  });
});
