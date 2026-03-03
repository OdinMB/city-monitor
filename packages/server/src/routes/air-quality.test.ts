/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

describe('Air Quality API', () => {
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
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/berlin/air-quality returns null when cache is empty and upstream fails', async () => {
    appContext.cache.delete('berlin:air-quality');
    // The route has a cache-miss fallback that fetches from Open-Meteo.
    // Mock fetch so the fallback fails, causing the route to return null.
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      // Let requests to our own test server through
      if (url.startsWith(baseUrl)) return originalFetch(input, init);
      // Block external API calls
      return Promise.resolve(new Response('', { status: 500 }));
    });

    const res = await fetch(`${baseUrl}/api/berlin/air-quality`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
    expect(body.fetchedAt).toBeNull();

    vi.restoreAllMocks();
  });

  it('GET /api/berlin/air-quality returns cached data', async () => {
    const mockData = {
      current: {
        europeanAqi: 35,
        pm25: 12.5,
        pm10: 22.0,
        no2: 18.3,
        o3: 45.0,
        updatedAt: '2026-03-02T10:00:00Z',
      },
      hourly: [
        { time: '2026-03-02T10:00', europeanAqi: 35, pm25: 12.5, pm10: 22.0 },
        { time: '2026-03-02T11:00', europeanAqi: 38, pm25: 13.0, pm10: 23.0 },
      ],
    };
    appContext.cache.set('berlin:air-quality', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/air-quality`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.current.europeanAqi).toBe(35);
    expect(body.data.hourly).toHaveLength(2);
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/air-quality returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/air-quality`);
    expect(res.status).toBe(404);
  });
});
