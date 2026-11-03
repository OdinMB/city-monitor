import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { ElectricityData } from '@city-monitor/shared';

describe('Electricity API', () => {
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

  it('GET /api/muenchen/electricity returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/muenchen/electricity`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('GET /api/muenchen/electricity returns the cached data, also in bootstrap', async () => {
    const data: ElectricityData = {
      controlArea: 'TenneT',
      mix: { at: '2026-11-03T00:30:00.000Z', mw: { windOnshore: 2792, gas: 4539 }, renewableShare: 38.1 },
      renewableHistory: [{ t: '2026-11-03T00:00:00.000Z', share: 38.4 }],
      grid: [{ t: '2026-11-03T00:30:00.000Z', share: 33.0, signal: 0, co2: 529, co2Forecast: 531 }],
    };
    appContext.cache.set('muenchen:electricity', data, 60);

    const res = await fetch(`${baseUrl}/api/muenchen/electricity`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/muenchen/bootstrap`)).json();
    expect(boot.electricity.data).toEqual(data);
  });

  it('GET /api/unknown/electricity returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/electricity`);
    expect(res.status).toBe(404);
  });
});
