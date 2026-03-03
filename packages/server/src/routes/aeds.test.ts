/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

describe('AEDs API', () => {
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

  it('GET /api/berlin/aeds returns empty array when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/aeds`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/aeds returns cached data', async () => {
    const mockData = [
      {
        id: 'aed-11111111',
        lat: 52.52,
        lon: 13.405,
        indoor: true,
        description: 'In the lobby',
        operator: 'Berlin DRK',
        openingHours: 'Mo-Fr 08:00-18:00',
        access: 'yes',
      },
    ];
    appContext.cache.set('berlin:aed:locations', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/aeds`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('aed-11111111');
    expect(body.data[0].indoor).toBe(true);
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/aeds returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/aeds`);
    expect(res.status).toBe(404);
  });
});
