/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadWeather } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import type { WeatherData } from '../cron/ingest-weather.js';

const log = createLogger('route:weather');

export function createWeatherRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/weather', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const data = cache.get<WeatherData>(`${city.id}:weather`);
    if (data) {
      res.json(data);
      return;
    }

    if (db) {
      try {
        const dbData = await loadWeather(db, city.id);
        if (dbData) {
          cache.set(`${city.id}:weather`, dbData, 1800);
          res.json(dbData);
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ current: null, hourly: [], daily: [], alerts: [] });
  });

  return router;
}
