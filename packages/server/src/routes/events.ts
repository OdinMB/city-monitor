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

    const events = cache.get<CityEvent[]>(`${city.id}:events:upcoming`);
    if (events) {
      res.json(filterFuture(events));
      return;
    }

    if (db) {
      try {
        const dbEvents = await loadEvents(db, city.id);
        if (dbEvents) {
          cache.set(`${city.id}:events:upcoming`, dbEvents, 21600);
          res.json(filterFuture(dbEvents));
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json([]);
  });

  return router;
}
