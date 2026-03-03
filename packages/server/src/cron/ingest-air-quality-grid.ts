/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { CityConfig, AirQualityGridPoint } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveAirQualityGrid } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

export type { AirQualityGridPoint } from '@city-monitor/shared';

const log = createLogger('ingest-aq-grid');

const AQ_TIMEOUT_MS = 15_000;
const SC_TIMEOUT_MS = 10_000;
const SC_MAX_STALE_MS = 2 * 60 * 60 * 1000; // Keep offline SC data for up to 2h

interface ScCacheEntry {
  point: AirQualityGridPoint;
  fetchedAt: number;
}

function getWaqiToken(): string {
  return process.env.WAQI_API_TOKEN ?? '';
}

// ---------------------------------------------------------------------------
// European AQI conversion from PM values (µg/m³)
// Based on European Environment Agency breakpoints
// ---------------------------------------------------------------------------

interface AqiBreakpoint { lo: number; hi: number; aqiLo: number; aqiHi: number }

const PM25_BREAKPOINTS: AqiBreakpoint[] = [
  { lo: 0,    hi: 10,   aqiLo: 0,   aqiHi: 20 },
  { lo: 10,   hi: 20,   aqiLo: 20,  aqiHi: 40 },
  { lo: 20,   hi: 25,   aqiLo: 40,  aqiHi: 60 },
  { lo: 25,   hi: 50,   aqiLo: 60,  aqiHi: 80 },
  { lo: 50,   hi: 75,   aqiLo: 80,  aqiHi: 100 },
  { lo: 75,   hi: 800,  aqiLo: 100, aqiHi: 150 },
];

const PM10_BREAKPOINTS: AqiBreakpoint[] = [
  { lo: 0,    hi: 20,   aqiLo: 0,   aqiHi: 20 },
  { lo: 20,   hi: 40,   aqiLo: 20,  aqiHi: 40 },
  { lo: 40,   hi: 50,   aqiLo: 40,  aqiHi: 60 },
  { lo: 50,   hi: 100,  aqiLo: 60,  aqiHi: 80 },
  { lo: 100,  hi: 150,  aqiLo: 80,  aqiHi: 100 },
  { lo: 150,  hi: 1200, aqiLo: 100, aqiHi: 150 },
];

function interpolateAqi(value: number, breakpoints: AqiBreakpoint[]): number {
  for (const bp of breakpoints) {
    if (value >= bp.lo && value <= bp.hi) {
      return Math.round(bp.aqiLo + ((value - bp.lo) / (bp.hi - bp.lo)) * (bp.aqiHi - bp.aqiLo));
    }
  }
  return 150; // beyond scale
}

/** Convert PM2.5 and/or PM10 µg/m³ to European AQI (max of both sub-indices). */
export function pmToEuropeanAqi(pm25: number | null, pm10: number | null): number | null {
  const indices: number[] = [];
  if (pm25 != null && pm25 >= 0) indices.push(interpolateAqi(pm25, PM25_BREAKPOINTS));
  if (pm10 != null && pm10 >= 0) indices.push(interpolateAqi(pm10, PM10_BREAKPOINTS));
  return indices.length > 0 ? Math.max(...indices) : null;
}

// ---------------------------------------------------------------------------
// WAQI fetch
// ---------------------------------------------------------------------------

interface WaqiStation {
  lat: number;
  lon: number;
  uid: number;
  aqi: string;
  station: { name: string; time: string };
}

async function fetchWaqiGrid(city: CityConfig): Promise<AirQualityGridPoint[]> {
  const { south, west, north, east } = city.boundingBox;
  const url = `https://api.waqi.info/map/bounds/?latlng=${south},${west},${north},${east}&token=${getWaqiToken()}`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(AQ_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) {
    log.warn(`${city.id}: WAQI returned ${response.status}`);
    return [];
  }

  const json: { status: string; data: WaqiStation[] } = await response.json();
  if (json.status !== 'ok' || !Array.isArray(json.data)) return [];

  const points: AirQualityGridPoint[] = [];

  for (const s of json.data) {
    const aqi = parseInt(s.aqi, 10);
    if (isNaN(aqi) || aqi < 0) continue;

    points.push({
      lat: s.lat,
      lon: s.lon,
      europeanAqi: aqi,
      station: s.station.name,
      url: `https://aqicn.org/station/@${s.uid}/`,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Sensor.Community fetch (config-driven, individual sensors)
// ---------------------------------------------------------------------------

interface SensorDataValue { value_type: string; value: string }
interface SensorReading {
  location: { latitude: string; longitude: string };
  sensordatavalues: SensorDataValue[];
}

async function fetchSensorCommunityStation(
  sensorId: number,
  name: string,
): Promise<AirQualityGridPoint | null> {
  const url = `https://data.sensor.community/airrohr/v1/sensor/${sensorId}/`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(SC_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return null;

  const readings: SensorReading[] = await response.json();
  if (!Array.isArray(readings) || readings.length === 0) return null;

  const latest = readings[0];
  const lat = parseFloat(latest.location.latitude);
  const lon = parseFloat(latest.location.longitude);
  if (isNaN(lat) || isNaN(lon)) return null;

  let pm25: number | null = null;
  let pm10: number | null = null;
  for (const v of latest.sensordatavalues) {
    const val = parseFloat(v.value);
    if (isNaN(val) || val < 0) continue;
    if (v.value_type === 'P2' || v.value_type === 'SDS_P2') pm25 = val;
    if (v.value_type === 'P1' || v.value_type === 'SDS_P1') pm10 = val;
  }

  const aqi = pmToEuropeanAqi(pm25, pm10);
  if (aqi == null) return null;

  return {
    lat, lon,
    europeanAqi: aqi,
    station: name,
    url: `https://maps.sensor.community/#17/${lat}/${lon}`,
  };
}

async function fetchConfiguredSensorCommunityStations(city: CityConfig): Promise<AirQualityGridPoint[]> {
  const stations = city.dataSources.airQuality?.sensorCommunityStations;
  if (!stations || stations.length === 0) return [];

  // Fetch sequentially — SC API rate-limits concurrent requests (HTTP 500)
  const points: AirQualityGridPoint[] = [];
  for (const s of stations) {
    try {
      const point = await fetchSensorCommunityStation(s.sensorId, s.name);
      if (point) points.push(point);
    } catch {
      log.warn(`${city.id}: SC station ${s.name} (${s.sensorId}) fetch failed`);
    }
  }
  return points;
}

// ---------------------------------------------------------------------------
// Combined ingestion
// ---------------------------------------------------------------------------

export async function ingestCityAirQualityGrid(city: CityConfig, cache: Cache, db: Db | null = null): Promise<void> {
  let waqiPoints: AirQualityGridPoint[] = [];
  try {
    waqiPoints = await fetchWaqiGrid(city);
  } catch {
    log.warn(`${city.id}: WAQI fetch failed`);
  }

  // Fetch fresh SC stations
  let freshScPoints: AirQualityGridPoint[] = [];
  try {
    freshScPoints = await fetchConfiguredSensorCommunityStations(city);
  } catch {
    log.warn(`${city.id}: Sensor.Community fetch failed, continuing with WAQI only`);
  }

  // Merge fresh SC data into per-station cache (preserves data from offline sensors)
  const scCacheKey = CK.airQualityScCache(city.id);
  const scCache = cache.get<Record<string, ScCacheEntry>>(scCacheKey) ?? {};
  const now = Date.now();

  for (const p of freshScPoints) {
    scCache[p.station] = { point: p, fetchedAt: now };
  }

  // Prune entries older than 2h
  for (const name of Object.keys(scCache)) {
    if (now - scCache[name].fetchedAt > SC_MAX_STALE_MS) {
      delete scCache[name];
    }
  }

  cache.set(scCacheKey, scCache, 7200);

  const scPoints = Object.values(scCache).map((e) => e.point);
  const grid = [...waqiPoints, ...scPoints];

  if (grid.length === 0) {
    log.warn(`${city.id}: no air quality grid points`);
    return;
  }

  cache.set(CK.airQualityGrid(city.id), grid, 1800);

  if (db) {
    try {
      await saveAirQualityGrid(db, city.id, grid);
    } catch {
      log.warn(`${city.id}: failed to persist AQ grid to DB`);
    }
  }

  log.info(`${city.id}: air quality grid updated (${waqiPoints.length} WAQI + ${scPoints.length} SC [${freshScPoints.length} fresh])`);
}

export function createAirQualityGridIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestAirQualityGrid(): Promise<void> {
    if (!getWaqiToken()) {
      log.info('skipped — WAQI_API_TOKEN not set');
      return;
    }

    const cities = getActiveCities();
    for (const city of cities) {
      try {
        await ingestCityAirQualityGrid(city, cache, db);
      } catch (err) {
        log.error(`${city.id}: air quality grid failed`, err);
      }
    }
  };
}
