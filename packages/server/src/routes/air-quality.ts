/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { AirQuality } from '../cron/ingest-weather.js';
import { ingestCityAirQuality } from '../cron/ingest-weather.js';
import type { AirQualityGridPoint } from '../cron/ingest-air-quality-grid.js';
import { ingestCityAirQualityGrid } from '../cron/ingest-air-quality-grid.js';
import { loadAirQualityGrid } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';

export function createAirQualityRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/air-quality', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    let data = cache.get<AirQuality>(`${city.id}:air-quality`);

    // Cache miss — fetch immediately instead of waiting for the next cron cycle
    if (!data) {
      try {
        await ingestCityAirQuality(city, cache);
        data = cache.get<AirQuality>(`${city.id}:air-quality`);
      } catch {
        // Fall through — return null
      }
    }

    res.json(data ?? null);
  });

  router.get('/:city/air-quality/grid', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    let data = cache.get<AirQualityGridPoint[]>(`${city.id}:air-quality:grid`);

    // Cache miss — try DB before live fetch (cache → DB → API)
    if (!data && db) {
      try {
        const rows = await loadAirQualityGrid(db, city.id);
        if (rows) {
          cache.set(`${city.id}:air-quality:grid`, rows, 1800);
          data = rows;
        }
      } catch {
        // Fall through to live fetch
      }
    }

    // Still no data — fetch from WAQI + Sensor.Community
    if (!data) {
      try {
        await ingestCityAirQualityGrid(city, cache, db);
        data = cache.get<AirQualityGridPoint[]>(`${city.id}:air-quality:grid`);
      } catch {
        // Fall through — return empty
      }
    }

    res.json(data ?? []);
  });

  return router;
}
