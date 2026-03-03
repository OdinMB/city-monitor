/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadWaterLevels } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import type { WaterLevelData } from '@city-monitor/shared';

const log = createLogger('route:water-levels');

export function createWaterLevelsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/water-levels', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<WaterLevelData>(CK.waterLevels(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const dbData = await loadWaterLevels(db, city.id);
        if (dbData) {
          cache.set(CK.waterLevels(city.id), dbData, 900);
          res.json({ data: dbData, fetchedAt: new Date().toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: { stations: [], fetchedAt: null }, fetchedAt: null });
  });

  return router;
}
