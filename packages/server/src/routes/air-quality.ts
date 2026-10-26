import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { AirQuality } from '@city-monitor/shared';
import { ingestCityAirQuality } from '../cron/ingest-weather.js';
import type { AirQualityGridPoint } from '../cron/ingest-air-quality-grid.js';
import { AQ_GRID_TTL_SECONDS, ingestCityAirQualityGrid } from '../cron/ingest-air-quality-grid.js';
import { loadAirQualityGrid } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { CK } from '../lib/cache-keys.js';

export function createAirQualityRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/air-quality', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    let cached = cache.getWithMeta<AirQuality>(CK.airQuality(city.id));

    // Cache miss — fetch immediately instead of waiting for the next cron cycle
    if (!cached) {
      try {
        await ingestCityAirQuality(city, cache);
        cached = cache.getWithMeta<AirQuality>(CK.airQuality(city.id));
      } catch {
        // Fall through — return null
      }
    }

    res.json(cached ?? { data: null, fetchedAt: null });
  });

  router.get('/:city/air-quality/grid', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    let cached = cache.getWithMeta<AirQualityGridPoint[]>(CK.airQualityGrid(city.id));

    // Cache miss — try DB before live fetch (cache → DB → API). The stored
    // grid has no WAQI stations; the next ingestion puts them back in the cache.
    if (!cached && db) {
      try {
        const result = await loadAirQualityGrid(db, city.id);
        if (result) {
          cache.set(CK.airQualityGrid(city.id), result.data, AQ_GRID_TTL_SECONDS, result.fetchedAt);
          cached = cache.getWithMeta<AirQualityGridPoint[]>(CK.airQualityGrid(city.id));
        }
      } catch {
        // Fall through to live fetch
      }
    }

    // Still no data — fetch from WAQI + Sensor.Community
    if (!cached) {
      try {
        await ingestCityAirQualityGrid(city, cache, db);
        cached = cache.getWithMeta<AirQualityGridPoint[]>(CK.airQualityGrid(city.id));
      } catch {
        // Fall through — return empty
      }
    }

    res.json(cached ?? { data: [], fetchedAt: null });
  });

  return router;
}
