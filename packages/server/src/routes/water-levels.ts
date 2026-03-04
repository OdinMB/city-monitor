import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadWaterLevels, loadWaterLevelHistory } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { parseHistoryDays } from '../lib/parse-history.js';
import type { WaterLevelData, HistoryPoint } from '@city-monitor/shared';

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
        const result = await loadWaterLevels(db, city.id);
        if (result) {
          cache.set(CK.waterLevels(city.id), result.data, 900, result.fetchedAt);
          res.json({ data: result.data, fetchedAt: result.fetchedAt.toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: { stations: [], fetchedAt: null }, fetchedAt: null });
  });

  router.get('/:city/water-levels/history', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) { res.status(404).json({ error: 'City not found' }); return; }

    const days = parseHistoryDays(req.query.range, 30) ?? 7;

    const ck = CK.waterLevelHistory(city.id, days);
    const cached2 = cache.get<HistoryPoint[]>(ck);
    if (cached2) { res.json({ data: cached2 }); return; }

    if (!db) { res.json({ data: [] }); return; }

    try {
      const history = await loadWaterLevelHistory(db, city.id, days);
      cache.set(ck, history, 900);
      res.json({ data: history });
    } catch (err) {
      log.error(`${city.id} water-level history failed`, err);
      res.json({ data: [] });
    }
  });

  return router;
}
