/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadSummary, loadNewsItems } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { applyDropLogic, type NewsDigest, type NewsItem } from '../cron/ingest-feeds.js';
import type { NewsSummary } from '../cron/summarize.js';

const log = createLogger('route:news');

export function createNewsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/news/digest', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<NewsDigest>(`${city.id}:news:digest`);
    if (cached) {
      res.json(cached);
      return;
    }

    // DB fallback when cache is cold
    if (db) {
      try {
        const items = await loadNewsItems(db, city.id);
        if (items && items.length > 0) {
          const filtered = applyDropLogic(items);

          const categories: Record<string, NewsItem[]> = {};
          for (const item of filtered) {
            if (!categories[item.category]) categories[item.category] = [];
            categories[item.category]!.push(item);
          }

          const rebuilt: NewsDigest = { items: filtered, categories, updatedAt: new Date().toISOString() };
          cache.set(`${city.id}:news:digest`, rebuilt, 900);
          for (const [cat, catItems] of Object.entries(categories)) {
            cache.set(`${city.id}:news:${cat}`, catItems, 900);
          }
          res.json({ data: rebuilt, fetchedAt: new Date().toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: { items: [], categories: {}, updatedAt: null }, fetchedAt: null });
  });

  router.get('/:city/news/summary', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cachedSummary = cache.getWithMeta<NewsSummary>(`${city.id}:news:summary`);
    if (cachedSummary) {
      res.json(cachedSummary);
      return;
    }

    if (db) {
      try {
        const dbSummary = await loadSummary(db, city.id);
        if (dbSummary) {
          cache.set(`${city.id}:news:summary`, dbSummary, 86400);
          res.json({ data: dbSummary, fetchedAt: new Date().toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: { briefing: null, generatedAt: null, headlineCount: 0, cached: false }, fetchedAt: null });
  });

  router.get('/:city/bootstrap', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const data = cache.getBatchWithMeta([
      `${city.id}:news:digest`,
      `${city.id}:weather`,
      `${city.id}:transit:alerts`,
      `${city.id}:events:upcoming`,
      `${city.id}:safety:recent`,
      `${city.id}:nina:warnings`,
      `${city.id}:air-quality`,
      `${city.id}:pharmacies:emergency`,
      `${city.id}:traffic:incidents`,
      `${city.id}:construction:sites`,
      `${city.id}:water-levels`,
      `${city.id}:budget`,
      `${city.id}:appointments`,
      `${city.id}:labor-market`,
      `${city.id}:wastewater:summary`,
    ]);

    res.json({
      news: data[`${city.id}:news:digest`] ?? null,
      weather: data[`${city.id}:weather`] ?? null,
      transit: data[`${city.id}:transit:alerts`] ?? null,
      events: data[`${city.id}:events:upcoming`] ?? null,
      safety: data[`${city.id}:safety:recent`] ?? null,
      nina: data[`${city.id}:nina:warnings`] ?? null,
      airQuality: data[`${city.id}:air-quality`] ?? null,
      pharmacies: data[`${city.id}:pharmacies:emergency`] ?? null,
      traffic: data[`${city.id}:traffic:incidents`] ?? null,
      construction: data[`${city.id}:construction:sites`] ?? null,
      waterLevels: data[`${city.id}:water-levels`] ?? null,
      budget: data[`${city.id}:budget`] ?? null,
      appointments: data[`${city.id}:appointments`] ?? null,
      laborMarket: data[`${city.id}:labor-market`] ?? null,
      wastewater: data[`${city.id}:wastewater:summary`] ?? null,
    });
  });

  return router;
}
