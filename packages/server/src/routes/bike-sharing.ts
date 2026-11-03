import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadBikeSharing } from '../db/reads.js';
import type { BikeSharingData } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { BIKE_SHARING_TTL_SECONDS } from '../cron/ingest-bike-sharing.js';

const log = createLogger('route:bike-sharing');

export function createBikeSharingRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/bike-sharing', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<BikeSharingData>(CK.bikeSharing(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadBikeSharing(db, city.id);
        if (result) {
          cache.set(CK.bikeSharing(city.id), result.data, BIKE_SHARING_TTL_SECONDS, result.fetchedAt);
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
