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

    const data = cache.get<WaterLevelData>(`${city.id}:water-levels`);
    if (data) {
      res.json(data);
      return;
    }

    if (db) {
      try {
        const dbData = await loadWaterLevels(db, city.id);
        if (dbData) {
          res.json(dbData);
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ stations: [], fetchedAt: null });
  });

  return router;
}
