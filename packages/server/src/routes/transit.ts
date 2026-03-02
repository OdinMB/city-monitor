/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import { getCityConfig } from '../config/index.js';
import type { TransitAlert } from '../cron/ingest-transit.js';

export function createTransitRouter(cache: Cache) {
  const router = Router();

  router.get('/:city/transit', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const alerts = cache.get<TransitAlert[]>(`${city.id}:transit:alerts`);
    if (!alerts) {
      res.json([]);
      return;
    }

    res.json(alerts);
  });

  return router;
}
