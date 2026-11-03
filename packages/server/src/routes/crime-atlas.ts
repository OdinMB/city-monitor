import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadCrimeAtlas } from '../db/reads.js';
import type { CrimeAtlasData } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { CRIME_ATLAS_TTL_SECONDS } from '../cron/ingest-crime-atlas.js';

const log = createLogger('route:crime-atlas');

export function createCrimeAtlasRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/crime-atlas', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<CrimeAtlasData>(CK.crimeAtlas(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadCrimeAtlas(db, city.id);
        if (result) {
          cache.set(CK.crimeAtlas(city.id), result.data, CRIME_ATLAS_TTL_SECONDS, result.fetchedAt);
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
