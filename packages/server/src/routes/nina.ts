import { Router } from 'express';
import type { NinaWarning } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadNinaWarnings } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { currentWarnings } from '../cron/ingest-nina.js';

const log = createLogger('route:nina');

export function createNinaRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/nina', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    // Non-German cities don't have NINA warnings
    if (city.country !== 'DE') {
      res.json({ data: [], fetchedAt: null });
      return;
    }

    // A list can outlive some of its warnings, so each answer leaves out those that have ended since
    const cached = cache.getWithMeta<NinaWarning[]>(CK.ninaWarnings(city.id));
    if (cached) {
      res.json({ data: currentWarnings(cached.data), fetchedAt: cached.fetchedAt });
      return;
    }

    if (db) {
      try {
        const result = await loadNinaWarnings(db, city.id);
        if (result) {
          cache.set(CK.ninaWarnings(city.id), result.data, 600, result.fetchedAt);
          res.json({ data: currentWarnings(result.data), fetchedAt: result.fetchedAt.toISOString() });
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
