import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadTrafficCounts } from '../db/reads.js';
import type { TrafficCountData } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { TRAFFIC_COUNTS_TTL_SECONDS } from '../cron/ingest-traffic-counts.js';

const log = createLogger('route:traffic-counts');

export function createTrafficCountsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/traffic-counts', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<TrafficCountData>(CK.trafficCounts(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadTrafficCounts(db, city.id);
        if (result) {
          cache.set(CK.trafficCounts(city.id), result.data, TRAFFIC_COUNTS_TTL_SECONDS, result.fetchedAt);
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
