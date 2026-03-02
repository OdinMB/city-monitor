/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import { getCityConfig } from '../config/index.js';
import type { CityEvent } from '../cron/ingest-events.js';

export function createEventsRouter(cache: Cache) {
  const router = Router();

  router.get('/:city/events', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const events = cache.get<CityEvent[]>(`${city.id}:events:upcoming`);
    if (!events) {
      res.json([]);
      return;
    }

    res.json(events);
  });

  return router;
}
