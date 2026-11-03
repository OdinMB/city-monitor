import { describe, expect, it } from 'vitest';
import type { AirQualityGridPoint, AirQualityStation } from '@city-monitor/shared';
import { createCache } from './cache.js';
import { isWaqiPoint, servedGrid, servedUbaStations, UBA_FRESH_MAX_AGE_MS, ubaIsFresh, ubaIsFreshInCache } from './air-quality-sources.js';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const station = (code: string, measuredAt: string): AirQualityStation => ({
  code, name: code, lat: 52.5, lon: 13.4, setting: 'background', network: 'BE', measuredAt, index: 1, no2: 20, pm10: 15, pm25: 8, o3: 40,
});
const waqi: AirQualityGridPoint = { lat: 52.52, lon: 13.41, europeanAqi: 40, station: 'Mitte', url: 'https://aqicn.org/station/@1/' };
const sensor: AirQualityGridPoint = { lat: 52.5, lon: 13.3, europeanAqi: 18, station: 'Charlottenburg', url: 'https://maps.sensor.community/#17/52.5/13.3' };

describe('ubaIsFresh', () => {
  it('goes by the newest reading, fresh under four hours', () => {
    expect(UBA_FRESH_MAX_AGE_MS).toBe(4 * 3600_000);
    expect(ubaIsFresh([station('A', '2026-11-03T05:00:00Z'), station('B', '2026-11-03T10:00:00Z')], NOW)).toBe(true);
    expect(ubaIsFresh([station('A', '2026-11-03T08:00:01Z')], NOW)).toBe(true);
    expect(ubaIsFresh([station('A', '2026-11-03T08:00:00Z')], NOW)).toBe(false);
    expect(ubaIsFresh([station('A', 'not a time')], NOW)).toBe(false);
    expect(ubaIsFresh([], NOW)).toBe(false);
    expect(ubaIsFresh(null, NOW)).toBe(false);
  });
});

describe('servedUbaStations', () => {
  it('serves fresh stations whole and stale or missing ones as null', () => {
    const fresh = [station('A', '2026-11-03T11:00:00Z')];
    expect(servedUbaStations(fresh, NOW)).toBe(fresh);
    expect(servedUbaStations([station('A', '2026-11-03T06:00:00Z')], NOW)).toBeNull();
    expect(servedUbaStations(null, NOW)).toBeNull();
  });
});

describe('servedGrid', () => {
  it('drops every WAQI point while UBA is fresh, keeping Sensor.Community', () => {
    expect(servedGrid([waqi, sensor], true)).toEqual([sensor]);
  });

  it('serves the whole grid, WAQI included, when UBA is stale or missing', () => {
    const grid = [waqi, sensor];
    expect(servedGrid(grid, false)).toBe(grid);
  });

  it('tells WAQI points by their aqicn.org link', () => {
    expect(isWaqiPoint(waqi)).toBe(true);
    expect(isWaqiPoint(sensor)).toBe(false);
    expect(isWaqiPoint({ url: undefined })).toBe(false);
  });
});

describe('ubaIsFreshInCache', () => {
  it('reads the city\'s cached UBA stations', () => {
    const cache = createCache();
    expect(ubaIsFreshInCache(cache, 'berlin', NOW)).toBe(false);
    cache.set('berlin:air-quality:stations', [station('A', '2026-11-03T11:00:00Z')], 60);
    expect(ubaIsFreshInCache(cache, 'berlin', NOW)).toBe(true);
    expect(ubaIsFreshInCache(cache, 'hamburg', NOW)).toBe(false);
  });
});
