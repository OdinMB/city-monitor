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

    const digest = cache.get<NewsDigest>(`${city.id}:news:digest`);
    if (digest) {
      res.json(digest);
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

          res.json({ items: filtered, categories, updatedAt: new Date().toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ items: [], categories: {}, updatedAt: null });
  });

  router.get('/:city/news/summary', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const summary = cache.get<NewsSummary>(`${city.id}:news:summary`);
    if (summary) {
      res.json(summary);
      return;
    }

    if (db) {
      try {
        const dbSummary = await loadSummary(db, city.id);
        if (dbSummary) {
          res.json(dbSummary);
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ briefing: null, generatedAt: null, headlineCount: 0, cached: false });
  });

  router.get('/:city/bootstrap', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const data = cache.getBatch([
      `${city.id}:news:digest`,
      `${city.id}:weather`,
      `${city.id}:transit:alerts`,
      `${city.id}:events:upcoming`,
      `${city.id}:safety:recent`,
      `${city.id}:nina:warnings`,
      `${city.id}:air-quality`,
      `${city.id}:pharmacies:emergency`,
      `${city.id}:traffic:incidents`,
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
    });
  });

  return router;
}
