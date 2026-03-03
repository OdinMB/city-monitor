/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

describe('Bathing Water API', () => {
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

  it('GET /api/berlin/bathing returns empty array when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/bathing`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/bathing returns cached data', async () => {
    const mockData = [
      {
        id: 'bath-B350',
        name: 'Strandbad Wannsee',
        district: 'Steglitz-Zehlendorf',
        waterBody: 'Unterhavel',
        lat: 52.438898,
        lon: 13.176804,
        measuredAt: '2025-09-16',
        waterTemp: 18.7,
        visibility: 1,
        quality: 'good',
        algae: null,
        advisory: null,
        classification: 'ausgezeichnet',
        detailUrl: 'https://www.berlin.de/lageso/badestellen/wannsee.php',
        inSeason: false,
      },
    ];
    appContext.cache.set('berlin:bathing:spots', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/bathing`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('bath-B350');
    expect(body.data[0].name).toBe('Strandbad Wannsee');
    expect(body.data[0].quality).toBe('good');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/bathing returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/bathing`);
    expect(res.status).toBe(404);
  });
});
