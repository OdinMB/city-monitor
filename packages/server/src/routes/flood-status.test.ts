import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { FloodStatus } from '@city-monitor/shared';

describe('Flood status API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,muenchen');
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

  it('GET /api/muenchen/flood-status returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/muenchen/flood-status`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=120');
  });

  it('GET /api/muenchen/flood-status returns the cached status, also in bootstrap', async () => {
    const status: FloodStatus = {
      gauges: [{
        id: 'BY_16005701', name: 'München', waterBody: 'Isar', upstream: false, floodClass: 1,
        stateLabel: 'Meldestufe 1', measuredAt: '2026-11-01T20:30:00+01:00', url: null,
      }],
      alerts: [],
      updated: '2026-11-01T20:41:47+01:00',
    };
    appContext.cache.set('muenchen:flood-status', status, 60);

    const res = await fetch(`${baseUrl}/api/muenchen/flood-status`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(status);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/muenchen/bootstrap`)).json();
    expect(boot.floodStatus.data).toEqual(status);
  });

  it('GET /api/unknown/flood-status returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/flood-status`);
    expect(res.status).toBe(404);
  });
});
