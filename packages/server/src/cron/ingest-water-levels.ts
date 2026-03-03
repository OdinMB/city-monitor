/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { WaterLevelData, WaterLevelStation } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveWaterLevels } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ingest-water-levels');

export type { WaterLevelData };

const API_BASE = 'https://www.pegelonline.wsv.de/webservices/rest-api/v2';
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL = 900; // 15 minutes

interface PegelonlineStation {
  uuid: string;
  shortname: string;
  longitude: number;
  latitude: number;
  water: { shortname: string; longname: string };
  timeseries: Array<{
    shortname: string;
    unit: string;
    currentMeasurement?: {
      timestamp: string;
      value: number;
      stateMnwMhw?: string;
      stateNswHsw?: string;
    };
    characteristicValues?: Array<{
      shortname: string;
      value: number;
    }>;
  }>;
}

function deriveState(
  apiState: string | undefined,
  currentLevel: number,
  characteristicValues: Array<{ shortname: string; value: number }>,
): WaterLevelStation['state'] {
  // Check for very_high: current exceeds HHW or MHW
  const mhw = characteristicValues.find(
    (cv) => cv.shortname === 'MHW' || cv.shortname === 'MThw',
  );
  if (mhw && currentLevel > mhw.value) {
    return 'very_high';
  }

  // Use API-provided state if meaningful
  if (apiState === 'low') return 'low';
  if (apiState === 'normal') return 'normal';
  if (apiState === 'high') return 'high';

  return 'unknown';
}

export function createWaterLevelIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestWaterLevels(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.waterLevels) continue;
      try {
        await ingestCityWaterLevels(city, cache, db);
      } catch (err) {
        log.error(`${city.id} water levels failed`, err);
      }
    }
  };
}

async function ingestCityWaterLevels(
  city: { id: string; dataSources: { waterLevels?: { stations: Array<{ uuid: string; name: string; waterBody: string; tidal?: boolean }> } } },
  cache: Cache,
  db: Db | null,
): Promise<void> {
  const config = city.dataSources.waterLevels;
  if (!config || config.stations.length === 0) return;

  const uuids = config.stations.map((s) => s.uuid).join(',');
  const url = `${API_BASE}/stations.json?ids=${uuids}&includeTimeseries=true&includeCurrentMeasurement=true&includeCharacteristicValues=true`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0 (https://github.com/OdinMB/city-monitor)' },
  });

  if (!res.ok) {
    log.error(`${city.id} PEGELONLINE API returned ${res.status}`);
    return;
  }

  const apiStations: PegelonlineStation[] = await res.json();
  const configMap = new Map(config.stations.map((s) => [s.uuid, s]));

  const stations: WaterLevelStation[] = [];
  for (const apiStation of apiStations) {
    const stationConfig = configMap.get(apiStation.uuid);
    if (!stationConfig) continue;

    const waterTimeseries = apiStation.timeseries.find((ts) => ts.shortname === 'W');
    if (!waterTimeseries?.currentMeasurement) continue;

    const measurement = waterTimeseries.currentMeasurement;
    const charValues = waterTimeseries.characteristicValues ?? [];

    stations.push({
      uuid: apiStation.uuid,
      name: stationConfig.name,
      waterBody: stationConfig.waterBody,
      lat: apiStation.latitude,
      lon: apiStation.longitude,
      currentLevel: measurement.value,
      timestamp: measurement.timestamp,
      state: deriveState(measurement.stateMnwMhw, measurement.value, charValues),
      tidal: stationConfig.tidal ?? false,
      characteristicValues: charValues.map((cv) => ({
        shortname: cv.shortname,
        value: cv.value,
      })),
    });
  }

  const data: WaterLevelData = {
    stations,
    fetchedAt: new Date().toISOString(),
  };

  cache.set(`${city.id}:water-levels`, data, CACHE_TTL);
  log.info(`${city.id}: ${stations.length} water level station(s) updated`);

  if (db) {
    try {
      await saveWaterLevels(db, city.id, data);
    } catch (err) {
      log.error(`${city.id} DB write failed`, err);
    }
  }
}
