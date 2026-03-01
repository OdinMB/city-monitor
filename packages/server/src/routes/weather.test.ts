/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { WeatherData } from '../cron/ingest-weather.js';

describe('Weather API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: ReturnType<typeof createApp>;

  beforeAll(async () => {
    appContext = createApp({ skipScheduler: true });
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

  it('GET /api/berlin/weather returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/weather`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ current: null, hourly: [], daily: [], alerts: [] });
  });

  it('GET /api/berlin/weather returns cached weather data', async () => {
    const mockData: WeatherData = {
      current: { temp: 12, feelsLike: 10, humidity: 65, precipitation: 0, weatherCode: 3, windSpeed: 15, windDirection: 240 },
      hourly: [{ time: '2026-03-02T00:00', temp: 10, precipProb: 20, weatherCode: 3 }],
      daily: [{ date: '2026-03-02', high: 15, low: 5, weatherCode: 3, precip: 0, sunrise: '06:30', sunset: '18:15' }],
      alerts: [],
    };
    appContext.cache.set('berlin:weather', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/weather`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.current.temp).toBe(12);
    expect(body.hourly).toHaveLength(1);
    expect(body.daily).toHaveLength(1);
  });

  it('GET /api/unknown/weather returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/weather`);
    expect(res.status).toBe(404);
  });
});
