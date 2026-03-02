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
 * - Writes to in-memory cache (Postgres persistence added later)
 * - Simplified concurrency model (batch of 10 vs 20)
 */

import type { CityConfig, FeedConfig } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import { parseFeed, type FeedItem } from '../lib/rss-parser.js';
import { classifyHeadline } from '../lib/classifier.js';
import { hashString } from '../lib/hash.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { filterAndGeolocateNews, type FilteredItem } from '../lib/openai.js';

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

export function createFeedIngestion(cache: Cache) {
  return async function ingestFeeds(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      try {
        await ingestCityFeeds(city, cache);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityFeeds(city: CityConfig, cache: Cache): Promise<void> {
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

  // LLM-based relevance filtering + geolocation
  const filtered = await applyLlmFilter(city, deduped);

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

  log.info(`${city.id}: ${filtered.length} articles (${deduped.length - filtered.length} filtered) from ${city.feeds.length} feeds`);
}

async function applyLlmFilter(city: CityConfig, items: NewsItem[]): Promise<NewsItem[]> {
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

    if (!result) return items; // Fallback: return all items when OpenAI is unavailable

    const filtered: NewsItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const verdict = result.find((r) => r.index === i);
      if (!verdict) {
        // No verdict — keep the item
        filtered.push(items[i]);
        continue;
      }

      // Drop items where LLM is confident they're irrelevant
      // But keep tier-1 items if confidence is below 0.7 (benefit of the doubt)
      if (!verdict.relevant && verdict.confidence >= 0.7 && items[i].tier > 1) {
        continue;
      }
      if (!verdict.relevant && verdict.confidence >= 0.9) {
        continue; // Drop even tier-1 if confidence is very high
      }

      // Attach location if provided
      if (verdict.lat != null && verdict.lon != null) {
        items[i] = {
          ...items[i],
          location: {
            lat: verdict.lat,
            lon: verdict.lon,
            label: verdict.locationLabel,
          },
        };
      }

      filtered.push(items[i]);
    }

    return filtered;
  } catch (err) {
    log.error(`${city.id} LLM filter failed, using unfiltered items`, err);
    return items;
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
  } catch (err) {
    log.warn(`failed to fetch ${feed.name}`);
    return null;
  }
}
