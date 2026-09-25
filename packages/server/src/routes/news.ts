import { Router } from 'express';
import type { NewsSummaryData } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadSummary, loadNewsItems } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
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

    const cached = cache.getWithMeta<NewsDigest>(CK.newsDigest(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    // DB fallback when cache is cold
    if (db) {
      try {
        const result = await loadNewsItems(db, city.id);
        if (result && result.data.length > 0) {
          const filtered = applyDropLogic(result.data);

          const categories: Record<string, NewsItem[]> = {};
          for (const item of filtered) {
            if (!categories[item.category]) categories[item.category] = [];
            categories[item.category]!.push(item);
          }

          const rebuilt: NewsDigest = { items: filtered, categories, updatedAt: result.fetchedAt.toISOString() };
          cache.set(CK.newsDigest(city.id), rebuilt, 900, result.fetchedAt);
          for (const [cat, catItems] of Object.entries(categories)) {
            cache.set(CK.newsCategory(city.id, cat), catItems, 900, result.fetchedAt);
          }
          res.json({ data: rebuilt, fetchedAt: result.fetchedAt.toISOString() });
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

    const requestedLang = typeof req.query.lang === 'string' ? req.query.lang : null;
    const lang = (requestedLang && city.languages.includes(requestedLang))
      ? requestedLang
      : city.languages[0] ?? 'de';

    let summary: NewsSummary | null = null;
    let fetchedAt: string | null = null;

    const cachedSummary = cache.getWithMeta<NewsSummary>(CK.newsSummary(city.id));
    if (cachedSummary) {
      summary = cachedSummary.data;
      fetchedAt = cachedSummary.fetchedAt;
    } else if (db) {
      try {
        const result = await loadSummary(db, city.id);
        if (result) {
          cache.set(CK.newsSummary(city.id), result.data, 86400, result.fetchedAt);
          summary = result.data;
          fetchedAt = result.fetchedAt.toISOString();
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    if (!summary) {
      const empty: NewsSummaryData = { briefing: null, generatedAt: null, headlineCount: 0, cached: false, aiGenerated: false, generator: null };
      res.json({ data: empty, fetchedAt: null });
      return;
    }

    const briefing = summary.briefings[lang] ?? summary.briefings[city.languages[0] ?? 'de'] ?? null;
    const data: NewsSummaryData = {
      briefing,
      generatedAt: summary.generatedAt,
      headlineCount: summary.headlineCount,
      cached: summary.cached,
      // Machine-readable AI marker (Art. 50(2) interim measure, not a watermark).
      aiGenerated: briefing !== null,
      generator: briefing !== null ? summary.model : null,
    };
    res.json({ data, fetchedAt });
  });

  return router;
}
