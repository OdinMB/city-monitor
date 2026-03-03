/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { NinaWarning } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadNinaWarnings } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('route:nina');

export function createNinaRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/nina', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    // Non-German cities don't have NINA warnings
    if (city.country !== 'DE') {
      res.json({ data: [], fetchedAt: null });
      return;
    }

    const cached = cache.getWithMeta<NinaWarning[]>(`${city.id}:nina:warnings`);
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const dbWarnings = await loadNinaWarnings(db, city.id);
        if (dbWarnings) {
          cache.set(`${city.id}:nina:warnings`, dbWarnings, 600);
          res.json({ data: dbWarnings, fetchedAt: new Date().toISOString() });
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
