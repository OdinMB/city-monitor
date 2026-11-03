import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadHeatRelief } from '../db/reads.js';
import type { HeatReliefData } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { HEAT_RELIEF_TTL_SECONDS } from '../cron/ingest-heat-relief.js';

const log = createLogger('route:heat-relief');

export function createHeatReliefRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/heat-relief', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<HeatReliefData>(CK.heatRelief(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadHeatRelief(db, city.id);
        if (result) {
          cache.set(CK.heatRelief(city.id), result.data, HEAT_RELIEF_TTL_SECONDS, result.fetchedAt);
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
