import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadCouncilMeetings } from '../db/reads.js';
import type { CouncilMeeting } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('route:council-meetings');

export function createCouncilMeetingsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/council-meetings', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<CouncilMeeting[]>(CK.councilMeetings(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadCouncilMeetings(db, city.id);
        if (result) {
          cache.set(CK.councilMeetings(city.id), result.data, 25920, result.fetchedAt);
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
