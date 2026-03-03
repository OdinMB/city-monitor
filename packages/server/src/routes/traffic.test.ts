/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

describe('Traffic API', () => {
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

  it('GET /api/berlin/traffic returns empty array when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/traffic`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/traffic returns cached data', async () => {
    const mockData = [
      {
        id: 'tt-1',
        type: 'jam',
        severity: 'major',
        description: 'Heavy traffic on A100',
        road: 'A100',
        from: 'Dreieck Funkturm',
        to: 'Kreuz Schöneberg',
        delay: 900,
        length: 5200,
        geometry: { type: 'LineString', coordinates: [[13.3, 52.5], [13.35, 52.48]] },
      },
    ];
    appContext.cache.set('berlin:traffic:incidents', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/traffic`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].road).toBe('A100');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/traffic returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/traffic`);
    expect(res.status).toBe(404);
  });
});
