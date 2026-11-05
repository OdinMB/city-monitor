import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadEvents } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { servedEvents } from '../lib/hht-gate.js';
import type { CityEvent } from '../cron/ingest-events.js';

const log = createLogger('route:events');

export function createEventsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/events', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const nowIso = new Date().toISOString();
    // Every response with events passes the HHT preview gate
    const served = (items: CityEvent[]) => servedEvents(items.filter((e) => e.date >= nowIso), req, res);

    const cached = cache.getWithMeta<CityEvent[]>(CK.eventsUpcoming(city.id));
    if (cached) {
      res.json({ data: served(cached.data), fetchedAt: cached.fetchedAt });
      return;
    }

    if (db) {
      try {
        const result = await loadEvents(db, city.id);
        if (result) {
          cache.set(CK.eventsUpcoming(city.id), result.data, 21600, result.fetchedAt);
          res.json({ data: served(result.data), fetchedAt: result.fetchedAt.toISOString() });
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
