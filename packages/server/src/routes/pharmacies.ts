import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadPharmacies } from '../db/reads.js';
import type { EmergencyPharmacy } from '../cron/ingest-pharmacies.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('route:pharmacies');

export function createPharmaciesRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/pharmacies', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<EmergencyPharmacy[]>(CK.pharmacies(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadPharmacies(db, city.id);
        if (result) {
          cache.set(CK.pharmacies(city.id), result.data, 21600, result.fetchedAt);
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
