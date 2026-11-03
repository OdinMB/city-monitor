import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { RespiratoryCases } from '@city-monitor/shared';

describe('Respiratory cases API', () => {
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

  it('returns null when nothing is cached', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/respiratory-cases`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
  });

  it('returns the cached figures', async () => {
    const data: RespiratoryCases = {
      week: '2026-W43',
      weekStart: '2026-10-19',
      pathogens: [
        { name: 'Influenza', cases: 18, incidence: 0.49, previousCases: 32, trend: 'falling', history: [32, 18] },
        { name: 'RSV', cases: 0, incidence: 0, previousCases: 4, trend: 'gone', history: [4, 0] },
      ],
    };
    appContext.cache.set('berlin:respiratory-cases', data, 60);

    const res = await fetch(`${baseUrl}/api/berlin/respiratory-cases`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=43200');
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('returns 404 for an unknown city', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/respiratory-cases`);
    expect(res.status).toBe(404);
  });
});
