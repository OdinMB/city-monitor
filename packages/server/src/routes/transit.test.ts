/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { TransitAlert } from '../cron/ingest-transit.js';

describe('Transit API', () => {
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

  it('GET /api/berlin/transit returns empty array when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/transit`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('GET /api/berlin/transit returns cached alerts', async () => {
    const mockAlerts: TransitAlert[] = [
      { id: '1', line: 'U2', type: 'disruption', severity: 'high', message: 'Test', detail: 'Test detail', station: 'Alexanderplatz', location: { lat: 52.52, lon: 13.41 }, affectedStops: [] },
    ];
    appContext.cache.set('berlin:transit:alerts', mockAlerts, 60);

    const res = await fetch(`${baseUrl}/api/berlin/transit`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].line).toBe('U2');
  });

  it('GET /api/unknown/transit returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/transit`);
    expect(res.status).toBe(404);
  });
});
