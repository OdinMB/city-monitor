import { Router } from 'express';
import type { AirQualityStation } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadAirQualityStations } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { servedUbaStations } from '../lib/air-quality-sources.js';
import { AIR_QUALITY_STATIONS_TTL_SECONDS } from '../cron/ingest-uba-air-quality.js';

const log = createLogger('route:air-quality-stations');

/**
 * Official state-network stations (UBA) of a city: cache, then Postgres, then
 * null. Readings that are no longer fresh are served as null, so the map and
 * tile fall back to WAQI (lib/air-quality-sources.ts).
 */
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
      const data = servedUbaStations(cached.data);
      res.json(data ? cached : { data: null, fetchedAt: null });
      return;
    }

    if (db) {
      try {
        const result = await loadAirQualityStations(db, city.id);
        if (result) {
          cache.set(key, result.data, AIR_QUALITY_STATIONS_TTL_SECONDS, result.fetchedAt);
          const data = servedUbaStations(result.data);
          res.json(data ? { data, fetchedAt: result.fetchedAt.toISOString() } : { data: null, fetchedAt: null });
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
