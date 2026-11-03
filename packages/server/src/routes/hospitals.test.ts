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

  it('GET /api/berlin/hospitals returns empty data when no cache', async () => {
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

  it('merges the stored sources when serving, and drops the Klinik-Atlas with KLINIK_ATLAS=false', async () => {
    const base = { children: false, strokeUnit: false, chestPainUnit: false, trauma: false, beds: null, url: null, address: null };
    const atlas = { ...base, id: 'kla-1', name: 'Atlas site', lat: 53.5780, lon: 10.0540, tier: 'extended' as const, source: 'klinik-atlas' as const };
    const wfs = { ...base, id: 'hh-1', name: 'WFS record', lat: 53.5782, lon: 10.0541, tier: 'emergency' as const, source: 'hamburg-wfs' as const };
    appContext.cache.set('hamburg:hospitals', { hospitals: [wfs, atlas], atlasDate: '2026-10-27' } satisfies HospitalData, 60);
    appContext.cache.set('berlin:hospitals', { hospitals: [{ ...atlas, id: 'kla-2' }], atlasDate: '2026-10-27' } satisfies HospitalData, 60);

    // On by default: the Atlas site wins within 250 m
    let hh = (await (await fetch(`${baseUrl}/api/hamburg/hospitals`)).json()).data as HospitalData;
    expect(hh.hospitals.map((h) => h.id)).toEqual(['kla-1']);
    expect(hh.atlasDate).toBe('2026-10-27');

    vi.stubEnv('KLINIK_ATLAS', 'false');
    try {
      hh = (await (await fetch(`${baseUrl}/api/hamburg/hospitals`)).json()).data as HospitalData;
      expect(hh).toEqual({ hospitals: [wfs], atlasDate: null });
      const berlin = (await (await fetch(`${baseUrl}/api/berlin/hospitals`)).json()).data as HospitalData;
      expect(berlin.hospitals).toEqual([]);
    } finally {
      vi.stubEnv('KLINIK_ATLAS', '');
    }
  });

  it('GET /api/unknown/hospitals returns 404', async () => {
    expect((await fetch(`${baseUrl}/api/unknown/hospitals`)).status).toBe(404);
  });
});
