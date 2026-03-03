/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadConstructionSites } from '../db/reads.js';
import type { ConstructionSite } from '../cron/ingest-construction.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('route:construction');

export function createConstructionRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/construction', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<ConstructionSite[]>(`${city.id}:construction:sites`);
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const stored = await loadConstructionSites(db, city.id);
        if (stored) {
          cache.set(`${city.id}:construction:sites`, stored, 1800);
          res.json({ data: stored, fetchedAt: new Date().toISOString() });
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
