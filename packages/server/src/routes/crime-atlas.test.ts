import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { CrimeAtlasData } from '@city-monitor/shared';

describe('Crime atlas API', () => {
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

  it('GET /api/hamburg/crime-atlas returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/hamburg/crime-atlas`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=43200');
  });

  it('GET /api/berlin/crime-atlas returns the cached atlas, which bootstrap leaves out', async () => {
    const figures = {
      total: 12882.1, totalCount: 502743, assault: 1276.8, assaultCount: 49830, robbery: 123.6, robberyCount: 4823,
      burglary: 272.1, burglaryCount: 10618, bikeTheft: 579.9, bikeTheftCount: 22630, kiez: 3174.3, kiezCount: 123883,
    };
    const data: CrimeAtlasData = {
      year: 2025,
      city: figures,
      geojson: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[13.3, 52.5], [13.31, 52.5], [13.31, 52.51], [13.3, 52.5]]] },
          properties: { areaId: '011001', name: 'Tiergarten Süd', district: 'Mitte', ...figures },
        }],
      },
    };
    appContext.cache.set('berlin:crime-atlas', data, 60);

    const res = await fetch(`${baseUrl}/api/berlin/crime-atlas`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/berlin/bootstrap`)).json();
    expect(boot).not.toHaveProperty('crimeAtlas');
  });

  it('GET /api/unknown/crime-atlas returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/crime-atlas`);
    expect(res.status).toBe(404);
  });
});
