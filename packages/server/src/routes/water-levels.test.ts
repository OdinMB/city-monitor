/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { WaterLevelData } from '@city-monitor/shared';

describe('Water Levels API', () => {
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

  it('GET /api/berlin/water-levels returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/water-levels`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ stations: [], fetchedAt: null });
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/water-levels returns cached data', async () => {
    const mockData: WaterLevelData = {
      stations: [{
        uuid: '09e15cf6-f155-4b76-b92f-6c260839121c',
        name: 'Mühlendamm',
        waterBody: 'Spree',
        lat: 52.514897,
        lon: 13.40869,
        currentLevel: 278,
        timestamp: '2026-03-03T01:30:00+01:00',
        state: 'normal',
        tidal: false,
        characteristicValues: [{ shortname: 'MW', value: 279 }],
      }],
      fetchedAt: '2026-03-03T00:30:00Z',
    };
    appContext.cache.set('berlin:water-levels', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/water-levels`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.stations).toHaveLength(1);
    expect(body.data.stations[0].name).toBe('Mühlendamm');
    expect(body.data.stations[0].currentLevel).toBe(278);
    expect(body.data.fetchedAt).toBe('2026-03-03T00:30:00Z');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/water-levels returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/water-levels`);
    expect(res.status).toBe(404);
  });
});
