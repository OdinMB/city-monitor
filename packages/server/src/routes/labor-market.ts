/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadLaborMarket, loadLaborMarketHistory } from '../db/reads.js';
import type { LaborMarketSummary, HistoryPoint } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { parseHistoryDays } from '../lib/parse-history.js';

const log = createLogger('route:labor-market');

export function createLaborMarketRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/labor-market', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<LaborMarketSummary>(CK.laborMarket(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const stored = await loadLaborMarket(db, city.id);
        if (stored) {
          cache.set(CK.laborMarket(city.id), stored, 86400);
          res.json({ data: stored, fetchedAt: new Date().toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: null, fetchedAt: null });
  });

  router.get('/:city/labor-market/history', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) { res.status(404).json({ error: 'City not found' }); return; }

    const days = parseHistoryDays(req.query.range, 730) ?? 365;

    const ck = CK.laborMarketHistory(city.id, days);
    const cached2 = cache.get<HistoryPoint[]>(ck);
    if (cached2) { res.json({ data: cached2 }); return; }

    if (!db) { res.json({ data: [] }); return; }

    try {
      const history = await loadLaborMarketHistory(db, city.id, days);
      cache.set(ck, history, 86400);
      res.json({ data: history });
    } catch (err) {
      log.error(`${city.id} labor-market history failed`, err);
      res.json({ data: [] });
    }
  });

  return router;
}
