import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { ParkingData } from '@city-monitor/shared';

describe('Parking API', () => {
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

  it('GET /api/berlin/parking returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/parking`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=120');
  });

  it('GET /api/hamburg/parking returns the cached car parks, which bootstrap leaves out', async () => {
    const data: ParkingData = {
      facilities: [{
        id: '10002', name: 'Am Hauptbahnhof', kind: 'garage', lat: 53.5547, lon: 10.0096, free: 246, total: 547,
        status: 'open', trend: 'filling', updated: '2026-11-03T03:03:00+01:00',
      }],
      updated: '2026-11-03T03:03:00+01:00',
    };
    appContext.cache.set('hamburg:parking', data, 60);

    const res = await fetch(`${baseUrl}/api/hamburg/parking`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/hamburg/bootstrap`)).json();
    expect(boot).not.toHaveProperty('parking');
  });

  it('GET /api/unknown/parking returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/parking`);
    expect(res.status).toBe(404);
  });
});
