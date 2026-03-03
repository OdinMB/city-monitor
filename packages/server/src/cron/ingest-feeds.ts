/**
 * Feed ingestion cron job.
 *
 * Adapted from World Monitor (AGPL-3.0)
 * Original: server/worldmonitor/news/v1/list-feed-digest.ts
 * Copyright (C) 2024-2026 Elie Habib
 *
 * Modifications:
 * - City-scoped instead of global variant-based
 * - Uses fast-xml-parser instead of regex parsing
 * - Persists items to Postgres with LLM assessments
 * - Only filters genuinely new items through LLM on each run
 * - Simplified concurrency model (batch of 10 vs 20)
 */

import type { CityConfig, FeedConfig } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveNewsItems, type PersistedNewsItem } from '../db/writes.js';
import { loadNewsItems } from '../db/reads.js';
import { parseFeed } from '../lib/rss-parser.js';
import { classifyHeadline } from '../lib/classifier.js';
import { hashString } from '../lib/hash.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { filterAndGeolocateNews } from '../lib/openai.js';

const log = createLogger('ingest-feeds');

const FEED_TIMEOUT_MS = 8_000;
const OVERALL_DEADLINE_MS = 25_000;
const BATCH_CONCURRENCY = 10;

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  sourceName: string;
  sourceUrl: string;
  description?: string;
  category: string;
  tier: number;
  lang: string;
  location?: { lat: number; lon: number; label?: string };
}

export interface NewsDigest {
  items: NewsItem[];
  categories: Record<string, NewsItem[]>;
  updatedAt: string;
}

export function createFeedIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestFeeds(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      try {
        await ingestCityFeeds(city, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityFeeds(city: CityConfig, cache: Cache, db: Db | null): Promise<void> {
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  const allItems: NewsItem[] = [];

  // Fetch feeds in batches
  for (let i = 0; i < city.feeds.length; i += BATCH_CONCURRENCY) {
    if (Date.now() > deadline) break;
    const batch = city.feeds.slice(i, i + BATCH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((feed) => fetchAndParseFeed(feed, cache, deadline)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allItems.push(...result.value);
      }
    }
  }

  // Deduplicate by hash
  const seen = new Set<string>();
  const deduped = allItems.filter((item) => {
    const hash = hashString(item.url + item.title);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });

  // Sort by tier (lower = higher priority), then recency
  deduped.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  // Load existing assessments from DB to avoid re-filtering known items
  const existingAssessments = new Map<string, { relevant: boolean; confidence: number; location?: NewsItem['location'] }>();
  if (db) {
    try {
      const existing = await loadNewsItems(db, city.id);
      if (existing) {
        for (const item of existing) {
          if (item.assessment?.relevant != null) {
            existingAssessments.set(item.id, {
              relevant: item.assessment.relevant,
              confidence: item.assessment.confidence ?? 0,
              location: item.location,
            });
          }
        }
      }
    } catch {
      // DB read failed — filter everything fresh
    }
  }

  // Partition into known (have DB assessment) and new (need LLM filter)
  const knownItems: PersistedNewsItem[] = [];
  const newItems: NewsItem[] = [];

  for (const item of deduped) {
    const stored = existingAssessments.get(item.id);
    if (stored) {
      knownItems.push({
        ...item,
        location: stored.location ?? item.location,
        assessment: { relevant: stored.relevant, confidence: stored.confidence },
      });
    } else {
      newItems.push(item);
    }
  }

  // LLM-based relevance filtering + geolocation (only for new items)
  const assessedNewItems = await applyLlmFilter(city, newItems);

  // Merge all items and apply drop logic
  const allAssessed: PersistedNewsItem[] = [
    ...knownItems,
    ...assessedNewItems,
  ];

  // Re-sort after merge
  allAssessed.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  // Apply relevance drop logic to all items
  const filtered = applyDropLogic(allAssessed);

  // Build digest
  const categories: Record<string, NewsItem[]> = {};
  for (const item of filtered) {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category]!.push(item);
  }

  const digest: NewsDigest = {
    items: filtered,
    categories,
    updatedAt: new Date().toISOString(),
  };

  // Write to cache
  cache.set(`${city.id}:news:digest`, digest, 900);
  for (const [cat, items] of Object.entries(categories)) {
    cache.set(`${city.id}:news:${cat}`, items, 900);
  }

  // Persist all items (including assessments) to DB
  if (db) {
    try {
      await saveNewsItems(db, city.id, allAssessed);
    } catch (err) {
      log.error(`${city.id} DB write failed`, err);
    }
  }

  const skippedCount = knownItems.length;
  const newCount = newItems.length;
  log.info(`${city.id}: ${filtered.length} articles (${skippedCount} from DB, ${newCount} new, ${allAssessed.length - filtered.length} filtered) from ${city.feeds.length} feeds`);
}

/**
 * Filters out items the LLM assessed as irrelevant.
 * Shared by ingest-feeds, warm-cache, and the news digest route.
 */
export function applyDropLogic(items: PersistedNewsItem[]): NewsItem[] {
  return items.filter((item) => {
    const a = item.assessment;
    if (!a) return true;
    if (a.relevant === false) return false;
    return true;
  });
}

async function applyLlmFilter(city: CityConfig, items: NewsItem[]): Promise<PersistedNewsItem[]> {
  if (items.length === 0) return [];

  try {
    const result = await filterAndGeolocateNews(
      city.id,
      city.name,
      items.map((item) => ({
        title: item.title,
        description: item.description,
        sourceName: item.sourceName,
      })),
    );

    if (!result) {
      // Fallback: return all items without assessment when OpenAI is unavailable
      return items.map((item) => ({ ...item }));
    }

    const assessed: PersistedNewsItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const verdict = result.find((r) => r.index === i);
      const item: PersistedNewsItem = { ...items[i] };

      if (verdict) {
        item.assessment = { relevant: verdict.relevant, confidence: verdict.confidence };

        // Attach location if provided
        if (verdict.lat != null && verdict.lon != null) {
          item.location = {
            lat: verdict.lat,
            lon: verdict.lon,
            label: verdict.locationLabel,
          };
        }
      }

      assessed.push(item);
    }

    return assessed;
  } catch (err) {
    log.error(`${city.id} LLM filter failed, returning items without assessment`, err);
    return items.map((item) => ({ ...item }));
  }
}

async function fetchAndParseFeed(
  feed: FeedConfig,
  cache: Cache,
  deadline: number,
): Promise<NewsItem[] | null> {
  const cacheKey = `feed:${hashString(feed.url)}`;
  const timeout = Math.min(FEED_TIMEOUT_MS, deadline - Date.now());
  if (timeout <= 0) return null;

  try {
    // Use cache for raw feed XML (avoid re-fetching within 10 min)
    const items = await cache.fetch<NewsItem[]>(cacheKey, 600, async () => {
      const response = await log.fetch(feed.url, {
        signal: AbortSignal.timeout(timeout),
        headers: { 'User-Agent': 'CityMonitor/1.0' },
      });
      if (!response.ok) return null;
      const xml = await response.text();
      const feedItems = parseFeed(xml);

      return feedItems.map((item): NewsItem => {
        const classification = classifyHeadline(item.title, 'berlin');
        return {
          id: hashString(item.url + item.title),
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          sourceName: feed.name,
          sourceUrl: feed.url,
          description: item.description,
          category: feed.category || classification.category,
          tier: feed.tier,
          lang: feed.lang,
        };
      });
    });

    return items;
  } catch (_err) {
    log.warn(`failed to fetch ${feed.name}`);
    return null;
  }
}
