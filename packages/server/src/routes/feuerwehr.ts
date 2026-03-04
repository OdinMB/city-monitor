import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadFeuerwehr } from '../db/reads.js';
import type { FeuerwehrSummary } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('route:feuerwehr');

export function createFeuerwehrRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/feuerwehr', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<FeuerwehrSummary>(CK.feuerwehr(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadFeuerwehr(db, city.id);
        if (result) {
          cache.set(CK.feuerwehr(city.id), result.data, 86400, result.fetchedAt);
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
