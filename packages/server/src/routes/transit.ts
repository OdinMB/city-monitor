/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadTransitAlerts } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import type { TransitAlert } from '../cron/ingest-transit.js';

const log = createLogger('route:transit');

export function createTransitRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/transit', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const alerts = cache.get<TransitAlert[]>(`${city.id}:transit:alerts`);
    if (alerts) {
      res.json(alerts);
      return;
    }

    if (db) {
      try {
        const dbAlerts = await loadTransitAlerts(db, city.id);
        if (dbAlerts) {
          cache.set(`${city.id}:transit:alerts`, dbAlerts, 1200);
          res.json(dbAlerts);
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
