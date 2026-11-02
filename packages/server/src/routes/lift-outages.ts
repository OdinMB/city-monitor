import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadLiftOutages } from '../db/reads.js';
import type { LiftOutageData } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { LIFT_OUTAGES_TTL_SECONDS } from '../cron/ingest-lift-outages.js';

const log = createLogger('route:lift-outages');

export function createLiftOutagesRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/lift-outages', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<LiftOutageData>(CK.liftOutages(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadLiftOutages(db, city.id);
        if (result) {
          cache.set(CK.liftOutages(city.id), result.data, LIFT_OUTAGES_TTL_SECONDS, result.fetchedAt);
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
