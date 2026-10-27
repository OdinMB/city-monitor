import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { NinaWarning } from '@city-monitor/shared';
import { createApp } from '../app.js';

describe('Bootstrap API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
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
  });

  it('GET /api/berlin/bootstrap returns all data slots', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/bootstrap`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('news');
    expect(body).toHaveProperty('weather');
    expect(body).toHaveProperty('transit');
    expect(body).toHaveProperty('events');
    expect(body).toHaveProperty('airQuality');
    expect(body).toHaveProperty('nina');
    expect(body).toHaveProperty('pharmacies');
    expect(body).toHaveProperty('traffic');
  });

  it('GET /api/berlin/bootstrap returns cached air quality data', async () => {
    const mockAq = {
      current: { europeanAqi: 42, pm25: 10, pm10: 20, no2: 15, o3: 30, updatedAt: '2026-03-01T00:00:00Z' },
      hourly: [],
    };
    appContext.cache.set('berlin:air-quality', mockAq, 60);

    const res = await fetch(`${baseUrl}/api/berlin/bootstrap`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.airQuality.data).toEqual(mockAq);
    expect(typeof body.airQuality.fetchedAt).toBe('string');
  });

  it('GET /api/berlin/bootstrap leaves out NINA warnings that have ended since they were cached', async () => {
    const base = { version: 1, startDate: '2026-03-02T10:00:00Z', severity: 'severe', source: 'mowas', headline: 'Test' } as const;
    const warnings: NinaWarning[] = [
      { ...base, id: 'mow.current', type: 'Alert', expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
      { ...base, id: 'mow.expired', type: 'Alert', expiresAt: new Date(Date.now() - 1_000).toISOString() },
      { ...base, id: 'mow.withdrawn', type: 'Cancel' },
    ];
    appContext.cache.set('berlin:nina:warnings', warnings, 60);

    const res = await fetch(`${baseUrl}/api/berlin/bootstrap`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.nina.data.map((w: NinaWarning) => w.id)).toEqual(['mow.current']);
    expect(typeof body.nina.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/bootstrap returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/bootstrap`);
    expect(res.status).toBe(404);
  });
});
