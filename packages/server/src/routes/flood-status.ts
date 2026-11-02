import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadFloodStatus } from '../db/reads.js';
import type { FloodStatus } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { FLOOD_STATUS_TTL_SECONDS } from '../cron/ingest-flood-status.js';

const log = createLogger('route:flood-status');

export function createFloodStatusRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/flood-status', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<FloodStatus>(CK.floodStatus(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadFloodStatus(db, city.id);
        if (result) {
          cache.set(CK.floodStatus(city.id), result.data, FLOOD_STATUS_TTL_SECONDS, result.fetchedAt);
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
