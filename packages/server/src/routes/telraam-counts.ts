import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadTelraamCounts } from '../db/reads.js';
import type { TelraamCountsData } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { TELRAAM_COUNTS_TTL_SECONDS } from '../cron/ingest-telraam-counts.js';

const log = createLogger('route:telraam-counts');

export function createTelraamCountsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/telraam-counts', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<TelraamCountsData>(CK.telraamCounts(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadTelraamCounts(db, city.id);
        if (result) {
          cache.set(CK.telraamCounts(city.id), result.data, TELRAAM_COUNTS_TTL_SECONDS, result.fetchedAt);
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
