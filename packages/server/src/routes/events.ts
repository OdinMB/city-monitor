/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadEvents } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
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
    const filterFuture = (items: CityEvent[]) => items.filter((e) => e.date >= nowIso);

    const cached = cache.getWithMeta<CityEvent[]>(CK.eventsUpcoming(city.id));
    if (cached) {
      res.json({ data: filterFuture(cached.data), fetchedAt: cached.fetchedAt });
      return;
    }

    if (db) {
      try {
        const dbEvents = await loadEvents(db, city.id);
        if (dbEvents) {
          cache.set(CK.eventsUpcoming(city.id), dbEvents, 21600);
          res.json({ data: filterFuture(dbEvents), fetchedAt: new Date().toISOString() });
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
