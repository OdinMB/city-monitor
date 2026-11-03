import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { HospitalData } from '@city-monitor/shared';

describe('Hospitals API', () => {
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

  it('GET /api/berlin/hospitals returns empty data when no cache (Klinik-Atlas off)', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/hospitals`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=43200');
  });

  it('GET /api/hamburg/hospitals returns the cached hospitals, not in bootstrap', async () => {
    const data: HospitalData = {
      hospitals: [{
        id: 'hh-1', name: 'Schön Klinik Hamburg Eilbek', address: 'Dehnhaide 120, 22081 Hamburg', lat: 53.578, lon: 10.054,
        tier: 'emergency', children: false, strokeUnit: false, chestPainUnit: false, trauma: false, beds: 719,
        url: 'https://www.schoen-klinik.de/hamburg-eilbek', source: 'hamburg-wfs',
      }],
      atlasDate: null,
    };
    appContext.cache.set('hamburg:hospitals', data, 60);

    const res = await fetch(`${baseUrl}/api/hamburg/hospitals`);
    const body = await res.json();
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/hamburg/bootstrap`)).json();
    expect(boot).not.toHaveProperty('hospitals');
  });

  it('GET /api/unknown/hospitals returns 404', async () => {
    expect((await fetch(`${baseUrl}/api/unknown/hospitals`)).status).toBe(404);
  });
});
