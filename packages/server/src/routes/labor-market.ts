/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadLaborMarket } from '../db/reads.js';
import type { LaborMarketSummary } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('route:labor-market');

export function createLaborMarketRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/labor-market', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.get<LaborMarketSummary>(`${city.id}:labor-market`);
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const stored = await loadLaborMarket(db, city.id);
        if (stored) {
          cache.set(`${city.id}:labor-market`, stored, 86400);
          res.json(stored);
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json(null);
  });

  return router;
}
