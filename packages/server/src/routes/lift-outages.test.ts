import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { LiftOutageData } from '@city-monitor/shared';

describe('Lift outages API', () => {
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

  it('GET /api/koeln/lift-outages returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/koeln/lift-outages`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('GET /api/koeln/lift-outages returns the cached outages, also in bootstrap', async () => {
    const data: LiftOutageData = {
      outages: [{ id: '011-04', kind: 'lift', station: 'Dom/HBf.', unit: 'Aufzug 04', lat: 50.94, lon: 6.96, info: null }],
      updated: '2026-11-02T04:10:32+01:00',
    };
    appContext.cache.set('koeln:lift-outages', data, 60);

    const res = await fetch(`${baseUrl}/api/koeln/lift-outages`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/koeln/bootstrap`)).json();
    expect(boot.liftOutages.data).toEqual(data);
  });

  it('GET /api/unknown/lift-outages returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/lift-outages`);
    expect(res.status).toBe(404);
  });
});
