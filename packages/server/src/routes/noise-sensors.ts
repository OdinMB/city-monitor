import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadNoiseSensors } from '../db/reads.js';
import type { NoiseSensor } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('route:noise-sensors');

export function createNoiseSensorsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/noise-sensors', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<NoiseSensor[]>(CK.noiseSensors(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadNoiseSensors(db, city.id);
        if (result) {
          cache.set(CK.noiseSensors(city.id), result.data, 1200, result.fetchedAt);
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
