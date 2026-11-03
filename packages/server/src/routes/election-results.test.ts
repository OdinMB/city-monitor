import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { ElectionResults } from '@city-monitor/shared';

describe('Election results API', () => {
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

  it('answers empty data for both parts when nothing is cached', async () => {
    for (const path of ['election-results', 'election-results/geojson']) {
      const res = await fetch(`${baseUrl}/api/hamburg/${path}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: null, fetchedAt: null });
      expect(res.headers.get('cache-control')).toBe('public, max-age=43200');
    }
  });

  it('serves the cached results and polygons, which bootstrap leaves out', async () => {
    const area = { turnout: 79.07, shares: [{ party: 'Die Linke', pct: 26.58 }], otherPct: 73.42, leader: 'Die Linke' };
    const results: ElectionResults = {
      election: 'abgeordnetenhaus',
      date: '2026-09-20',
      areaLevel: 'wahlkreis',
      total: { ...area, id: 'total', name: 'total', eligible: 2487318, voters: 1846344 },
      areas: [{ ...area, id: '0101', name: 'Mitte 1' }],
      sourceUrl: 'https://www.wahlen-berlin.de/wahlen/BE2026/Afspraes/AGH/DL/DL_BE_AGHBVV2026.xlsx',
    };
    const geojson = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: { id: '0101', name: 'Mitte 1', leader: 'Die Linke', leaderPct: 26.58 } }] };
    appContext.cache.set('berlin:election-results', results, 60);
    appContext.cache.set('berlin:election-results:geojson', geojson, 60);

    const body = await (await fetch(`${baseUrl}/api/berlin/election-results`)).json();
    expect(body.data).toEqual(results);
    expect(typeof body.fetchedAt).toBe('string');
    expect((await (await fetch(`${baseUrl}/api/berlin/election-results/geojson`)).json()).data).toEqual(geojson);

    const boot = await (await fetch(`${baseUrl}/api/berlin/bootstrap`)).json();
    expect(boot).not.toHaveProperty('electionResults');
  });

  it('answers 404 for an unknown city', async () => {
    expect((await fetch(`${baseUrl}/api/unknown/election-results`)).status).toBe(404);
  });
});
