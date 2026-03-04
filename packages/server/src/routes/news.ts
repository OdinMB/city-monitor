import { Router } from 'express';
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
      res.json({ data: { briefing: null, generatedAt: null, headlineCount: 0, cached: false }, fetchedAt: null });
      return;
    }

    const briefing = summary.briefings[lang] ?? summary.briefings[city.languages[0] ?? 'de'] ?? null;
    res.json({
      data: {
        briefing,
        generatedAt: summary.generatedAt,
        headlineCount: summary.headlineCount,
        cached: summary.cached,
      },
      fetchedAt,
    });
  });

  router.get('/:city/bootstrap', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const data = cache.getBatchWithMeta(CK.bootstrapKeys(city.id));

    res.json({
      news: data[CK.newsDigest(city.id)] ?? null,
      weather: data[CK.weather(city.id)] ?? null,
      transit: data[CK.transitAlerts(city.id)] ?? null,
      events: data[CK.eventsUpcoming(city.id)] ?? null,
      safety: data[CK.safetyRecent(city.id)] ?? null,
      nina: data[CK.ninaWarnings(city.id)] ?? null,
      airQuality: data[CK.airQuality(city.id)] ?? null,
      pharmacies: data[CK.pharmacies(city.id)] ?? null,
      aeds: data[CK.aedLocations(city.id)] ?? null,
      traffic: data[CK.trafficIncidents(city.id)] ?? null,
      construction: data[CK.constructionSites(city.id)] ?? null,
      waterLevels: data[CK.waterLevels(city.id)] ?? null,
      budget: data[CK.budget(city.id)] ?? null,
      appointments: data[CK.appointments(city.id)] ?? null,
      laborMarket: data[CK.laborMarket(city.id)] ?? null,
      wastewater: data[CK.wastewaterSummary(city.id)] ?? null,
      populationSummary: data[CK.populationSummary(city.id)] ?? null,
      feuerwehr: data[CK.feuerwehr(city.id)] ?? null,
      pollen: data[CK.pollen(city.id)] ?? null,
    });
  });

  return router;
}
