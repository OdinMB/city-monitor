import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { CitizenReportData } from '@city-monitor/shared';

describe('Citizen reports API', () => {
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

  it('GET /api/muenchen/citizen-reports returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/muenchen/citizen-reports`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('GET /api/muenchen/citizen-reports returns the cached reports, which bootstrap leaves out', async () => {
    const data: CitizenReportData = {
      reports: [{
        id: '94579-2026', lat: 48.1162, lon: 11.5769, category: 'Leuchte ausgefallen', group: 'lighting',
        status: 'in_progress', statusLabel: 'In Bearbeitung', requestedAt: '2026-11-02T01:00:27+01:00',
        updatedAt: null, url: 'https://machmuenchenbesser.de/requests/94579-2026',
      }],
      windowDays: 14,
      total: 1,
      counts: { open: 0, in_progress: 1, closed: 0 },
    };
    appContext.cache.set('muenchen:citizen-reports', data, 60);

    const res = await fetch(`${baseUrl}/api/muenchen/citizen-reports`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(typeof body.fetchedAt).toBe('string');

    const boot = await (await fetch(`${baseUrl}/api/muenchen/bootstrap`)).json();
    expect(boot).not.toHaveProperty('citizenReports');
  });

  it('GET /api/unknown/citizen-reports returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/citizen-reports`);
    expect(res.status).toBe(404);
  });
});
