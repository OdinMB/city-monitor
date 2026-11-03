import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { TrafficAccidentData } from '@city-monitor/shared';

describe('Traffic accidents API', () => {
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

  it('GET /api/hamburg/traffic-accidents returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/hamburg/traffic-accidents`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=43200');
  });

  it('GET /api/berlin/traffic-accidents returns the cached accidents, which bootstrap leaves out', async () => {
    const data: TrafficAccidentData = {
      year: 2025,
      accidents: [[13.4512, 52.5099, 3, 4, 7, 14, 5, 3, 1]],
      published: '2026-07-07T07:47:16',
    };
    appContext.cache.set('berlin:traffic-accidents', data, 60);

    const res = await fetch(`${baseUrl}/api/berlin/traffic-accidents`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/berlin/bootstrap`)).json();
    expect(boot).not.toHaveProperty('trafficAccidents');
  });

  it('GET /api/unknown/traffic-accidents returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/traffic-accidents`);
    expect(res.status).toBe(404);
  });
});
