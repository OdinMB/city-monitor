import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { HeatReliefData } from '@city-monitor/shared';

describe('Heat relief API', () => {
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

  it('GET /api/hamburg/heat-relief returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/hamburg/heat-relief`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=43200');
  });

  it('GET /api/berlin/heat-relief returns the cached places, which bootstrap leaves out', async () => {
    const data: HeatReliefData = {
      places: [
        { kind: 'fountain', lat: 52.43135, lon: 13.41505, name: 'Britzer Garten (nahe Tennishalle)', season: { from: 5, to: 10 } },
        { kind: 'toilet', lat: 52.52146, lon: 13.41295, name: 'WC-Center Alexanderplatz 1', fee: 0.5, accessible: 'partly' },
      ],
    };
    appContext.cache.set('berlin:heat-relief', data, 60);

    const res = await fetch(`${baseUrl}/api/berlin/heat-relief`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/berlin/bootstrap`)).json();
    expect(boot).not.toHaveProperty('heatRelief');
  });

  it('GET /api/unknown/heat-relief returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/heat-relief`);
    expect(res.status).toBe(404);
  });
});
