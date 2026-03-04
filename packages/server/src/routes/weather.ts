import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadWeather, loadWeatherHistory } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { parseHistoryDays } from '../lib/parse-history.js';
import type { WeatherData } from '../cron/ingest-weather.js';
import type { HistoryPoint } from '@city-monitor/shared';

const log = createLogger('route:weather');

export function createWeatherRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/weather', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<WeatherData>(CK.weather(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadWeather(db, city.id);
        if (result) {
          cache.set(CK.weather(city.id), result.data, 1800, result.fetchedAt);
          res.json({ data: result.data, fetchedAt: result.fetchedAt.toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: { current: null, hourly: [], daily: [], alerts: [] }, fetchedAt: null });
  });

  router.get('/:city/weather/history', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) { res.status(404).json({ error: 'City not found' }); return; }

    const days = parseHistoryDays(req.query.range, 7) ?? 7;

    const ck = CK.weatherHistory(city.id, days);
    const cached = cache.get<HistoryPoint[]>(ck);
    if (cached) { res.json({ data: cached }); return; }

    if (!db) { res.json({ data: [] }); return; }

    try {
      const history = await loadWeatherHistory(db, city.id, days);
      cache.set(ck, history, 1800);
      res.json({ data: history });
    } catch (err) {
      log.error(`${city.id} weather history failed`, err);
      res.json({ data: [] });
    }
  });

  return router;
}
