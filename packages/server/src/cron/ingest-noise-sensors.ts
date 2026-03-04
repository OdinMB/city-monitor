import type { NoiseSensor } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveNoiseSensors } from '../db/writes.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { getActiveCities } from '../config/index.js';

const log = createLogger('ingest-noise-sensors');

const FETCH_TIMEOUT_MS = 30_000;
const TTL_SECONDS = 1200; // 20 minutes

const SC_BASE = 'https://data.sensor.community/airrohr/v1/filter';

interface ScSensorData {
  sensor: { id: number; sensor_type?: { name?: string } };
  location: { latitude: string; longitude: string };
  sensordatavalues: Array<{ value_type: string; value: string }>;
}

/**
 * Parse Sensor.Community area response and extract DNMS noise sensors.
 */
export function parseNoiseSensors(entries: ScSensorData[]): NoiseSensor[] {
  const sensorMap = new Map<number, NoiseSensor>();

  for (const entry of entries) {
    const values = entry.sensordatavalues ?? [];
    let laeq: number | null = null;
    let laMin: number | null = null;
    let laMax: number | null = null;

    for (const v of values) {
      if (v.value_type === 'noise_LAeq') laeq = parseFloat(v.value);
      else if (v.value_type === 'noise_LA_min') laMin = parseFloat(v.value);
      else if (v.value_type === 'noise_LA_max') laMax = parseFloat(v.value);
    }

    if (laeq === null || isNaN(laeq)) continue;

    const lat = parseFloat(entry.location?.latitude);
    const lon = parseFloat(entry.location?.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;

    sensorMap.set(entry.sensor.id, {
      id: entry.sensor.id,
      lat,
      lon,
      laeq: Math.round(laeq * 10) / 10,
      laMin: Math.round((laMin ?? laeq) * 10) / 10,
      laMax: Math.round((laMax ?? laeq) * 10) / 10,
    });
  }

  return Array.from(sensorMap.values());
}

export function createNoiseSensorIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestNoiseSensors(): Promise<void> {
    try {
      const cities = getActiveCities();

      for (const city of cities) {
        const cfg = city.dataSources.noiseSensors;
        if (!cfg) continue;

        const url = `${SC_BASE}/area=${cfg.lat},${cfg.lon},${cfg.radius}`;
        const res = await log.fetch(url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: { 'User-Agent': 'city-monitor/1.0' },
        });

        if (!res.ok) {
          log.warn(`${city.id} Sensor.Community returned ${res.status}`);
          continue;
        }

        const entries = await res.json() as ScSensorData[];
        const sensors = parseNoiseSensors(entries);

        if (sensors.length === 0) {
          log.warn(`${city.id} no noise sensors found`);
          continue;
        }

        cache.set(CK.noiseSensors(city.id), sensors, TTL_SECONDS);

        if (db) {
          try {
            await saveNoiseSensors(db, city.id, sensors);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }

        log.info(`${city.id} noise sensors updated: ${sensors.length} DNMS sensors`);
      }
    } catch (err) {
      log.error('Noise sensor ingestion failed', err);
    }
  };
}
