/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadSafetyReports } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import type { SafetyReport } from '../cron/ingest-safety.js';

const log = createLogger('route:safety');

export function createSafetyRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/safety', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<SafetyReport[]>(`${city.id}:safety:recent`);
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const dbReports = await loadSafetyReports(db, city.id);
        if (dbReports) {
          cache.set(`${city.id}:safety:recent`, dbReports, 900);
          res.json({ data: dbReports, fetchedAt: new Date().toISOString() });
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
