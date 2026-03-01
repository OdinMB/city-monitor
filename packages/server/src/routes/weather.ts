/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import { getCityConfig } from '../config/index.js';
import type { WeatherData } from '../cron/ingest-weather.js';

export function createWeatherRouter(cache: Cache) {
  const router = Router();

  router.get('/:city/weather', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const data = cache.get<WeatherData>(`${city.id}:weather`);
    if (!data) {
      res.json({ current: null, hourly: [], daily: [], alerts: [] });
      return;
    }

    res.json(data);
  });

  return router;
}
