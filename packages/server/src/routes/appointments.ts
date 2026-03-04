import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadAppointments } from '../db/reads.js';
import type { BuergeramtData } from '../cron/ingest-appointments.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('route:appointments');

const EMPTY_DEFAULT: BuergeramtData = {
  services: [],
  fetchedAt: '',
  bookingUrl: 'https://service.berlin.de/terminvereinbarung/',
};

export function createAppointmentsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/appointments', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<BuergeramtData>(CK.appointments(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadAppointments(db, city.id);
        if (result) {
          cache.set(CK.appointments(city.id), result.data, 21600, result.fetchedAt);
          res.json({ data: result.data, fetchedAt: result.fetchedAt.toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: EMPTY_DEFAULT, fetchedAt: null });
  });

  return router;
}
