import type { CityConfig, FeedConfig } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveNewsItems, type PersistedNewsItem } from '../db/writes.js';
import { loadAllNewsAssessments } from '../db/reads.js';
import { parseFeed } from '../lib/rss-parser.js';
import { hashString } from '../lib/hash.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { filterAndGeolocateNews } from '../lib/openai.js';

const log = createLogger('ingest-feeds');

/** Per-feed HTTP timeout. */
const PER_FEED_TIMEOUT = 10_000;
/** Hard ceiling for the entire ingestion cycle per city. */
const CITY_DEADLINE = 30_000;
/** Max feeds fetched concurrently. */
const CONCURRENCY = 8;

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
  importance?: number;
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

// ---------------------------------------------------------------------------
// City-level orchestration
// ---------------------------------------------------------------------------

async function ingestCityFeeds(city: CityConfig, cache: Cache, db: Db | null): Promise<void> {
  const cutoff = Date.now() + CITY_DEADLINE;

  // 1. Fetch all feeds concurrently (capped) and dedup inline
  const collected = await fetchAllFeeds(city.feeds, cache, cutoff);

  // 2. Sort: highest-priority tier first, then newest
  collected.sort((a, b) =>
    a.tier !== b.tier
      ? a.tier - b.tier
      : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  // 3. Load prior assessments from DB so we don't re-filter known items
  const hashes = collected.map((item) => item.id);
  const prior = await loadPriorAssessments(db, city.id, hashes);

  // 4. Partition into already-assessed vs new
  const known: PersistedNewsItem[] = [];
  const fresh: NewsItem[] = [];

  for (const item of collected) {
    const stored = prior.get(item.id);
    if (stored) {
      known.push({
        ...item,
        category: stored.category ?? item.category,
        location: stored.location ?? item.location,
        assessment: { relevant_to_city: stored.relevant_to_city, importance: stored.importance, category: stored.category },
      });
    } else {
      fresh.push(item);
    }
  }

  // 5. Run LLM relevance filter on new items only
  const assessed = await applyLlmFilter(city, fresh);

  // 6. Merge, re-sort by importance (higher first), filter irrelevant
  const merged: PersistedNewsItem[] = [...known, ...assessed];
  merged.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const aImp = a.assessment?.importance ?? 0;
    const bImp = b.assessment?.importance ?? 0;
    if (aImp !== bImp) return bImp - aImp;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  const visible = applyDropLogic(merged);

  // 7. Build category buckets
  const categories: Record<string, NewsItem[]> = {};
  for (const item of visible) {
    (categories[item.category] ??= []).push(item);
  }

  const digest: NewsDigest = { items: visible, categories, updatedAt: new Date().toISOString() };

  // 8. Write to cache
  cache.set(CK.newsDigest(city.id), digest, 900);
  for (const [cat, items] of Object.entries(categories)) {
    cache.set(CK.newsCategory(city.id, cat), items, 900);
  }

  // 9. Persist to DB
  if (db) {
    try {
      await saveNewsItems(db, city.id, merged);
    } catch (err) {
      log.error(`${city.id} DB write failed`, err);
    }
  }

  log.info(
    `${city.id}: ${visible.length} articles (${known.length} from DB, ${fresh.length} new, ${merged.length - visible.length} filtered) from ${city.feeds.length} feeds`,
  );
}

// ---------------------------------------------------------------------------
// Feed fetching with concurrent pool + inline dedup
// ---------------------------------------------------------------------------

async function fetchAllFeeds(
  feeds: readonly FeedConfig[],
  cache: Cache,
  cutoff: number,
): Promise<NewsItem[]> {
  const seen = new Map<string, true>();
  const items: NewsItem[] = [];

  // Process feeds through a concurrent pool of CONCURRENCY workers
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < feeds.length && Date.now() < cutoff) {
      const feed = feeds[cursor++]!;
      const parsed = await fetchOneFeed(feed, cache, cutoff);
      if (!parsed) continue;

      for (const item of parsed) {
        if (!seen.has(item.id)) {
          seen.set(item.id, true);
          items.push(item);
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, feeds.length) }, () => worker());
  await Promise.allSettled(workers);
  return items;
}

async function fetchOneFeed(
  feed: FeedConfig,
  cache: Cache,
  cutoff: number,
): Promise<NewsItem[] | null> {
  const cacheKey = `feed:${hashString(feed.url)}`;
  const remaining = cutoff - Date.now();
  if (remaining <= 0) return null;
  const timeout = Math.min(PER_FEED_TIMEOUT, remaining);

  try {
    return await cache.fetch<NewsItem[]>(cacheKey, 600, async () => {
      const res = await log.fetch(feed.url, {
        signal: AbortSignal.timeout(timeout),
        headers: { 'User-Agent': 'CityMonitor/1.0' },
      });
      if (!res.ok) return null;

      const xml = await res.text();
      return parseFeed(xml).map((fi): NewsItem => ({
        id: hashString(fi.url + fi.title),
        title: fi.title,
        url: fi.url,
        publishedAt: fi.publishedAt,
        sourceName: feed.name,
        sourceUrl: feed.url,
        description: fi.description,
        category: feed.category || 'local',
        tier: feed.tier,
        lang: feed.lang,
      }));
    });
  } catch {
    log.warn(`failed to fetch ${feed.name}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// DB assessment reuse
// ---------------------------------------------------------------------------

interface PriorAssessment {
  relevant_to_city: boolean;
  importance: number;
  category?: string;
  location?: NewsItem['location'];
}

async function loadPriorAssessments(
  db: Db | null,
  cityId: string,
  hashes: string[],
): Promise<Map<string, PriorAssessment>> {
  const map = new Map<string, PriorAssessment>();
  if (!db || hashes.length === 0) return map;

  try {
    const rows = await loadAllNewsAssessments(db, cityId, hashes);
    if (rows) {
      for (const row of rows) {
        // Only reuse assessments that have the new importance field;
        // items with old-format assessments (relevant/confidence) get re-assessed
        if (row.assessment?.relevant_to_city != null && row.assessment?.importance != null) {
          map.set(row.id, {
            relevant_to_city: row.assessment.relevant_to_city,
            importance: row.assessment.importance,
            category: row.assessment.category,
            location: row.location,
          });
        }
      }
    }
  } catch {
    // DB unavailable — proceed without prior assessments
  }
  return map;
}

// ---------------------------------------------------------------------------
// LLM filtering
// ---------------------------------------------------------------------------

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
      return items.map((item) => ({ ...item }));
    }

    const assessed: PersistedNewsItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const verdict = result.find((r) => r.index === i);
      const item: PersistedNewsItem = { ...items[i] };

      if (verdict) {
        item.category = verdict.category;
        item.assessment = {
          relevant_to_city: verdict.relevant_to_city,
          importance: verdict.importance,
          category: verdict.category,
        };
        if (verdict.lat != null && verdict.lon != null) {
          item.location = { lat: verdict.lat, lon: verdict.lon, label: verdict.locationLabel };
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

// ---------------------------------------------------------------------------
// Shared drop logic (used by warm-cache and news route too)
// ---------------------------------------------------------------------------

/**
 * Filters out items the LLM assessed as irrelevant.
 * Shared by ingest-feeds, warm-cache, and the news digest route.
 */
export function applyDropLogic(items: PersistedNewsItem[]): NewsItem[] {
  return items
    .filter((item) => {
      const a = item.assessment;
      if (!a) return false;
      if (a.relevant_to_city !== true) return false;
      return true;
    })
    .map(({ assessment, ...rest }) => ({
      ...rest,
      importance: assessment?.importance ?? 0.5,
    }));
}
