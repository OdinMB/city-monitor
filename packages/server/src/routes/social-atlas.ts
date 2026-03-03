/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadSocialAtlas } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('route:social-atlas');

export function createSocialAtlasRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/social-atlas', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.get<unknown>(`${city.id}:social-atlas:geojson`);
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const stored = await loadSocialAtlas(db, city.id);
        if (stored) {
          cache.set(`${city.id}:social-atlas:geojson`, stored, 604800);
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
