/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * News summarization cron job.
 *
 * Adapted from World Monitor (AGPL-3.0)
 * Original: server/worldmonitor/news/v1/summarize-article.ts
 * Copyright (C) 2024-2026 Elie Habib
 *
 * Modifications:
 * - City-scoped summarization instead of per-article
 * - Uses headline hash to skip regeneration when headlines unchanged
 * - Writes to in-memory cache (Postgres persistence added later)
 */

import type { Cache } from '../lib/cache.js';
import { summarizeHeadlines, isConfigured } from '../lib/openai.js';
import { hashString } from '../lib/hash.js';
import { getActiveCities } from '../config/index.js';
import type { NewsDigest } from './ingest-feeds.js';

export interface NewsSummary {
  briefing: string;
  generatedAt: string;
  headlineCount: number;
  cached: boolean;
}

const SUMMARY_TTL = 86400; // 24 hours
const TOP_HEADLINES = 10;

export function createSummarization(cache: Cache) {
  return async function summarizeNews(): Promise<void> {
    if (!isConfigured()) return;

    const cities = getActiveCities();
    for (const city of cities) {
      try {
        await summarizeCityNews(city.id, city.name, city.languages[0] ?? 'en', cache);
      } catch (err) {
        console.error(`[summarize] ${city.id} failed:`, err);
      }
    }
  };
}

async function summarizeCityNews(
  cityId: string,
  cityName: string,
  lang: string,
  cache: Cache,
): Promise<void> {
  const digest = cache.get<NewsDigest>(`${cityId}:news:digest`);
  if (!digest || digest.items.length === 0) return;

  // Take top headlines (tier 1+2, most recent)
  const topItems = digest.items
    .filter((item) => item.tier <= 2)
    .slice(0, TOP_HEADLINES);

  if (topItems.length === 0) return;

  // Build cache key from sorted top-5 headlines to detect changes
  const keyHeadlines = topItems
    .slice(0, 5)
    .map((item) => item.title)
    .sort()
    .join('|');
  const headlineHash = hashString(keyHeadlines);

  // Check if we already have a summary for these headlines
  const existing = cache.get<NewsSummary & { headlineHash: string }>(`${cityId}:news:summary`);
  if (existing && existing.headlineHash === headlineHash) return;

  const headlines = topItems.map((item) => item.title);
  const result = await summarizeHeadlines(cityName, headlines, lang);
  if (!result) return;

  const summary: NewsSummary & { headlineHash: string } = {
    briefing: result.summary,
    generatedAt: new Date().toISOString(),
    headlineCount: headlines.length,
    cached: result.cached,
    headlineHash,
  };

  cache.set(`${cityId}:news:summary`, summary, SUMMARY_TTL);
  console.log(`[summarize] ${cityId}: summary generated (${headlines.length} headlines)`);
}
