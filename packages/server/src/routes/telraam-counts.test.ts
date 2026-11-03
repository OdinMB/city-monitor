import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { TelraamCountsData } from '@city-monitor/shared';

describe('Telraam counts API', () => {
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

  it('GET /api/hamburg/telraam-counts returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/hamburg/telraam-counts`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('GET /api/berlin/telraam-counts returns the cached counts, which bootstrap leaves out', async () => {
    const data: TelraamCountsData = {
      date: '2026-11-02',
      segments: [{
        id: 9000001786, lon: 13.401, lat: 52.5, street: 'Oranienstraße', district: 'Kreuzberg',
        cars: 2300, bikes: 700, pedestrians: 300, heavy: 400, hours: 8,
        usual: { cars: 2100, bikes: 800, pedestrians: 300, heavy: 400, days: 3 },
      }],
    };
    appContext.cache.set('berlin:telraam-counts', data, 60);

    const res = await fetch(`${baseUrl}/api/berlin/telraam-counts`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/berlin/bootstrap`)).json();
    expect(boot).not.toHaveProperty('telraamCounts');
  });

  it('GET /api/unknown/telraam-counts returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/telraam-counts`);
    expect(res.status).toBe(404);
  });
});
