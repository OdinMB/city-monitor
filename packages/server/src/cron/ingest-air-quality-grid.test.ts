/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAirQualityGridIngestion, pmToEuropeanAqi } from './ingest-air-quality-grid.js';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { AirQualityGridPoint } from '@city-monitor/shared';

const mockSaveAirQualityGrid = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveAirQualityGrid: (...args: unknown[]) => mockSaveAirQualityGrid(...args),
}));

const mockWaqiResponse = {
  status: 'ok',
  data: [
    { lat: 52.52, lon: 13.41, uid: 1, aqi: '42', station: { name: 'Berlin Mitte', time: '2026-03-02T12:00:00Z' } },
    { lat: 52.48, lon: 13.35, uid: 2, aqi: '35', station: { name: 'Berlin Steglitz', time: '2026-03-02T12:00:00Z' } },
    { lat: 52.55, lon: 13.45, uid: 3, aqi: '-', station: { name: 'Invalid', time: '2026-03-02T12:00:00Z' } },
  ],
};

// Sensor.Community per-sensor endpoint returns an array of recent readings
const mockScSensorResponse = [
  {
    location: { latitude: '52.552', longitude: '13.204' },
    sensordatavalues: [
      { value_type: 'P2', value: '15.5' },
      { value_type: 'P1', value: '22.0' },
    ],
    timestamp: '2026-03-02T12:00:00Z',
  },
];

describe('pmToEuropeanAqi', () => {
  it('converts PM2.5 = 5 µg/m³ to AQI ~10', () => {
    const aqi = pmToEuropeanAqi(5, null);
    expect(aqi).toBe(10);
  });

  it('converts PM10 = 30 µg/m³ to AQI ~30', () => {
    const aqi = pmToEuropeanAqi(null, 30);
    expect(aqi).toBe(30);
  });

  it('returns max of PM2.5 and PM10 sub-indices', () => {
    const aqi = pmToEuropeanAqi(5, 30);
    expect(aqi).toBe(30);
  });

  it('returns null when both are null', () => {
    expect(pmToEuropeanAqi(null, null)).toBeNull();
  });

  it('handles high PM2.5 values (> 75)', () => {
    const aqi = pmToEuropeanAqi(100, null);
    expect(aqi).toBeGreaterThanOrEqual(100);
  });
});

describe('createAirQualityGridIngestion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('WAQI_API_TOKEN', 'test-token');
    mockSaveAirQualityGrid.mockClear();
  });

  /** Berlin config has 14 sensorCommunityStations — mock WAQI + N individual SC fetches */
  function mockFetchWaqiThenSc(scResponse: unknown = mockScSensorResponse) {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(mockWaqiResponse), { status: 200 }));
    // 14 configured SC stations — each gets an individual fetch
    for (let i = 0; i < 14; i++) {
      spy.mockResolvedValueOnce(new Response(JSON.stringify(scResponse), { status: 200 }));
    }
    return spy;
  }

  it('fetches WAQI stations and caches valid points', async () => {
    mockFetchWaqiThenSc();

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    const grid = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    expect(grid).not.toBeNull();
    expect(grid!.length).toBeGreaterThanOrEqual(2);
    expect(grid![0].europeanAqi).toBe(42);
    expect(grid![0].station).toBe('Berlin Mitte');
    expect(grid![1].europeanAqi).toBe(35);
  });

  it('filters out stations with non-numeric AQI', async () => {
    mockFetchWaqiThenSc();

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    const grid = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    expect(grid!.find((p) => p.station === 'Invalid')).toBeUndefined();
  });

  it('handles WAQI API errors gracefully', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('error', { status: 500 }));
    // SC stations still get fetched
    for (let i = 0; i < 14; i++) {
      spy.mockResolvedValueOnce(new Response(JSON.stringify(mockScSensorResponse), { status: 200 }));
    }

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    // Grid should still have SC stations even if WAQI failed
    const grid = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    expect(grid).not.toBeNull();
    const scStations = grid!.filter((p) => p.station.includes('Spandau') || p.station.includes('Reinickendorf'));
    expect(scStations.length).toBeGreaterThan(0);
  });

  it('skips ingestion when WAQI_API_TOKEN is not set', async () => {
    vi.stubEnv('WAQI_API_TOKEN', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.get('berlin:air-quality:grid')).toBeNull();
  });

  it('handles non-ok status from WAQI response', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'error', data: [] }), { status: 200 }));
    for (let i = 0; i < 14; i++) {
      spy.mockResolvedValueOnce(new Response(JSON.stringify(mockScSensorResponse), { status: 200 }));
    }

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    // Still has SC stations
    const grid = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    expect(grid).not.toBeNull();
  });

  it('persists grid to DB when db is provided', async () => {
    mockFetchWaqiThenSc();

    const cache = createCache();
    const db = {} as unknown as Db;
    const ingest = createAirQualityGridIngestion(cache, db);
    await ingest();

    expect(mockSaveAirQualityGrid).toHaveBeenCalledOnce();
    expect(mockSaveAirQualityGrid).toHaveBeenCalledWith(db, 'berlin', expect.any(Array));
  });

  it('does not persist to DB when db is null', async () => {
    mockFetchWaqiThenSc();

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    expect(mockSaveAirQualityGrid).not.toHaveBeenCalled();
  });

  it('supplements WAQI with configured Sensor.Community stations', async () => {
    mockFetchWaqiThenSc();

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    const grid = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    expect(grid).not.toBeNull();
    // Should have WAQI stations + SC stations from config
    const scStations = grid!.filter((p) => p.url?.includes('maps.sensor.community'));
    expect(scStations.length).toBe(14);
    expect(scStations[0].url).toContain('maps.sensor.community');
    // Station names come from config
    expect(grid!.find((p) => p.station === 'Spandau')).toBeDefined();
    expect(grid!.find((p) => p.station === 'Reinickendorf')).toBeDefined();
  });

  it('skips SC stations that return no data', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(mockWaqiResponse), { status: 200 }));
    // 9 stations succeed on primary (1 fetch each), 5 fail all 3 candidates (primary + 2 fallbacks)
    const ok = () => spy.mockResolvedValueOnce(new Response(JSON.stringify(mockScSensorResponse), { status: 200 }));
    const fail3 = () => { // primary + 2 fallbacks all fail
      spy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
      spy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
      spy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    };
    ok(); fail3(); ok(); fail3(); ok(); ok(); fail3(); ok(); ok(); fail3(); ok(); fail3(); ok(); ok();

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    const grid = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    const scStations = grid!.filter((p) => p.url?.includes('maps.sensor.community'));
    expect(scStations).toHaveLength(9);
  });

  it('continues with WAQI only when all SC fetches fail', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(mockWaqiResponse), { status: 200 }));
    // 14 stations × 3 candidates each (primary + 2 fallbacks) = 42 failures
    for (let i = 0; i < 14 * 3; i++) {
      spy.mockRejectedValueOnce(new Error('Network error'));
    }

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    const grid = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    expect(grid).not.toBeNull();
    expect(grid).toHaveLength(2); // Only WAQI stations
  });

  it('preserves offline SC stations from previous ingestion cycle', async () => {
    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);

    // Cycle 1: all SC stations return data
    mockFetchWaqiThenSc();
    await ingest();

    const gridAfterCycle1 = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    const scAfterCycle1 = gridAfterCycle1!.filter((p) => p.url?.includes('maps.sensor.community'));
    expect(scAfterCycle1).toHaveLength(14);

    // Cycle 2: only 1 SC station returns data, 13 are offline (each tries 3 candidates)
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(mockWaqiResponse), { status: 200 }));
    spy.mockResolvedValueOnce(new Response(JSON.stringify(mockScSensorResponse), { status: 200 })); // Spandau primary OK
    for (let i = 0; i < 13 * 3; i++) {
      spy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // offline: primary + 2 fallbacks
    }
    await ingest();

    const gridAfterCycle2 = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    const scAfterCycle2 = gridAfterCycle2!.filter((p) => p.url?.includes('maps.sensor.community'));
    // All 14 SC stations should still be present (13 carried forward from cycle 1)
    expect(scAfterCycle2).toHaveLength(14);
  });

  it('converts PM values to European AQI for SC stations', async () => {
    // Custom response: PM2.5=15.5 → AQI~31, PM10=22.0 → AQI~22, max=31
    mockFetchWaqiThenSc();

    const cache = createCache();
    const ingest = createAirQualityGridIngestion(cache);
    await ingest();

    const grid = cache.get<AirQualityGridPoint[]>('berlin:air-quality:grid');
    const spandau = grid!.find((p) => p.station === 'Spandau');
    expect(spandau).toBeDefined();
    expect(spandau!.europeanAqi).toBe(31);
  });
});
