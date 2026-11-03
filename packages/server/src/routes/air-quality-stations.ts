import { Router } from 'express';
import type { AirQualityStation } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadAirQualityStations } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { AIR_QUALITY_STATIONS_TTL_SECONDS } from '../cron/ingest-uba-air-quality.js';

const log = createLogger('route:air-quality-stations');

/** Official state-network stations (UBA) of a city: cache, then Postgres, then null. */
export function createAirQualityStationsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/air-quality/stations', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const key = CK.airQualityStations(city.id);
    const cached = cache.getWithMeta<AirQualityStation[]>(key);
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadAirQualityStations(db, city.id);
        if (result) {
          cache.set(key, result.data, AIR_QUALITY_STATIONS_TTL_SECONDS, result.fetchedAt);
          res.json({ data: result.data, fetchedAt: result.fetchedAt.toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: null, fetchedAt: null });
  });

  return router;
}
