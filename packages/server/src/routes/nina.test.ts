import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { NinaWarning } from '@city-monitor/shared';

describe('NINA API', () => {
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

  it('GET /api/berlin/nina returns empty array when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/nina`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/nina returns cached warnings', async () => {
    const mockWarnings: NinaWarning[] = [
      {
        id: 'mow.test.1',
        version: 1,
        startDate: '2026-03-02T10:00:00Z',
        severity: 'severe',
        type: 'NATURAL_HAZARD',
        source: 'mowas',
        headline: 'Sturm in Berlin',
      },
    ];
    appContext.cache.set('berlin:nina:warnings', mockWarnings, 60);

    const res = await fetch(`${baseUrl}/api/berlin/nina`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].headline).toBe('Sturm in Berlin');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/berlin/nina leaves out cached warnings that have ended since they were fetched', async () => {
    const base = { version: 1, startDate: '2026-03-02T10:00:00Z', severity: 'severe', source: 'mowas', headline: 'Test' } as const;
    const warnings: NinaWarning[] = [
      { ...base, id: 'mow.current', type: 'Alert', expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
      { ...base, id: 'mow.expired', type: 'Alert', expiresAt: new Date(Date.now() - 1_000).toISOString() },
      { ...base, id: 'mow.withdrawn', type: 'Cancel' },
    ];
    appContext.cache.set('berlin:nina:warnings', warnings, 60);

    const res = await fetch(`${baseUrl}/api/berlin/nina`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.map((w: NinaWarning) => w.id)).toEqual(['mow.current']);
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/nina returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/nina`);
    expect(res.status).toBe(404);
  });
});
