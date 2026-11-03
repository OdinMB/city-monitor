import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadRespiratoryCases } from '../db/reads.js';
import type { RespiratoryCases } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { RESPIRATORY_CASES_TTL_SECONDS } from '../cron/ingest-respiratory-cases.js';

const log = createLogger('route:respiratory-cases');

export function createRespiratoryCasesRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/respiratory-cases', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<RespiratoryCases>(CK.respiratoryCases(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadRespiratoryCases(db, city.id);
        if (result) {
          cache.set(CK.respiratoryCases(city.id), result.data, RESPIRATORY_CASES_TTL_SECONDS, result.fetchedAt);
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
