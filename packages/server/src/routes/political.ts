import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadPoliticalDistricts } from '../db/reads.js';
import type { PoliticalDistrict } from '../cron/ingest-political.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('route:political');

const VALID_LEVELS = ['bundestag', 'state', 'bezirke', 'state-bezirke'];

export function createPoliticalRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/political/:level', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const level = req.params.level;
    if (!VALID_LEVELS.includes(level)) {
      res.status(400).json({ error: `Invalid level. Use one of: ${VALID_LEVELS.join(', ')}` });
      return;
    }

    const cached = cache.getWithMeta<PoliticalDistrict[]>(CK.political(city.id, level));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadPoliticalDistricts(db, city.id, level);
        if (result) {
          cache.set(CK.political(city.id, level), result.data, 604800, result.fetchedAt);
          res.json({ data: result.data, fetchedAt: result.fetchedAt.toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} ${level} DB read failed`, err);
      }
    }

    res.json({ data: [], fetchedAt: null });
  });

  return router;
}
