import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { SoilMoistureData } from '@city-monitor/shared';

describe('Soil moisture API', () => {
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

  it('GET /api/muenchen/soil-moisture returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/muenchen/soil-moisture`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('GET /api/muenchen/soil-moisture returns the cached data, also in bootstrap', async () => {
    const data: SoilMoistureData = {
      stations: [{ id: '3379', name: 'München-Stadt', date: '2026-11-01', sandy: 53, loamy: 47 }],
      history: [{ date: '2026-10-31', sandy: 54, loamy: 48 }, { date: '2026-11-01', sandy: 53, loamy: 47 }],
      watering: null,
    };
    appContext.cache.set('muenchen:soil-moisture', data, 60);

    const res = await fetch(`${baseUrl}/api/muenchen/soil-moisture`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/muenchen/bootstrap`)).json();
    expect(boot.soilMoisture.data).toEqual(data);
  });

  it('GET /api/unknown/soil-moisture returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/soil-moisture`);
    expect(res.status).toBe(404);
  });
});
