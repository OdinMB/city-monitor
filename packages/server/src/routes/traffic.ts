import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadTrafficIncidents } from '../db/reads.js';
import type { TrafficIncident } from '../cron/ingest-traffic.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('route:traffic');

export function createTrafficRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/traffic', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<TrafficIncident[]>(CK.trafficIncidents(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadTrafficIncidents(db, city.id);
        if (result) {
          cache.set(CK.trafficIncidents(city.id), result.data, 300, result.fetchedAt);
          res.json({ data: result.data, fetchedAt: result.fetchedAt.toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: [], fetchedAt: null });
  });

  return router;
}
