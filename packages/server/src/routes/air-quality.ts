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
import { loadAirQualityGrid, loadAqiHistory } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { CK } from '../lib/cache-keys.js';
import { parseHistoryDays } from '../lib/parse-history.js';
import { createLogger } from '../lib/logger.js';
import type { HistoryPoint } from '@city-monitor/shared';

const log = createLogger('route:air-quality');

export function createAirQualityRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/air-quality', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    let cached = cache.getWithMeta<AirQuality>(CK.airQuality(city.id));

    // Cache miss — fetch immediately instead of waiting for the next cron cycle
    if (!cached) {
      try {
        await ingestCityAirQuality(city, cache);
        cached = cache.getWithMeta<AirQuality>(CK.airQuality(city.id));
      } catch {
        // Fall through — return null
      }
    }

    res.json(cached ?? { data: null, fetchedAt: null });
  });

  router.get('/:city/air-quality/grid', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    let cached = cache.getWithMeta<AirQualityGridPoint[]>(CK.airQualityGrid(city.id));

    // Cache miss — try DB before live fetch (cache → DB → API)
    if (!cached && db) {
      try {
        const rows = await loadAirQualityGrid(db, city.id);
        if (rows) {
          cache.set(CK.airQualityGrid(city.id), rows, 1800);
          cached = cache.getWithMeta<AirQualityGridPoint[]>(CK.airQualityGrid(city.id));
        }
      } catch {
        // Fall through to live fetch
      }
    }

    // Still no data — fetch from WAQI + Sensor.Community
    if (!cached) {
      try {
        await ingestCityAirQualityGrid(city, cache, db);
        cached = cache.getWithMeta<AirQualityGridPoint[]>(CK.airQualityGrid(city.id));
      } catch {
        // Fall through — return empty
      }
    }

    res.json(cached ?? { data: [], fetchedAt: null });
  });

  router.get('/:city/air-quality/history', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) { res.status(404).json({ error: 'City not found' }); return; }

    const days = parseHistoryDays(req.query.range, 30) ?? 7;

    const ck = CK.aqiHistory(city.id, days);
    const cached2 = cache.get<HistoryPoint[]>(ck);
    if (cached2) { res.json({ data: cached2 }); return; }

    if (!db) { res.json({ data: [] }); return; }

    try {
      const history = await loadAqiHistory(db, city.id, days);
      cache.set(ck, history, 1800);
      res.json({ data: history });
    } catch (err) {
      log.error(`${city.id} AQI history failed`, err);
      res.json({ data: [] });
    }
  });

  return router;
}
