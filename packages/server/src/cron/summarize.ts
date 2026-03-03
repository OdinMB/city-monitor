/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * News summarization cron job.
 */

import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveSummary } from '../db/writes.js';
import { summarizeHeadlines, isConfigured } from '../lib/openai.js';
import { hashString } from '../lib/hash.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import type { NewsDigest } from './ingest-feeds.js';

const log = createLogger('summarize');

export interface NewsSummary {
  briefing: string;
  generatedAt: string;
  headlineCount: number;
  cached: boolean;
}

const SUMMARY_TTL = 86400; // 24 hours
const TOP_HEADLINES = 25;

export function createSummarization(cache: Cache, db: Db | null = null) {
  return async function summarizeNews(): Promise<void> {
    if (!isConfigured()) {
      log.info('skipped — OPENAI_API_KEY not set');
      return;
    }

    const cities = getActiveCities();
    for (const city of cities) {
      try {
        await summarizeCityNews(city.id, city.name, city.languages[0] ?? 'en', cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function summarizeCityNews(
  cityId: string,
  cityName: string,
  lang: string,
  cache: Cache,
  db: Db | null,
): Promise<void> {
  const digest = cache.get<NewsDigest>(CK.newsDigest(cityId));
  if (!digest || digest.items.length === 0) return;

  // Take most recent stories with importance > 0.5 (up to 25)
  const topItems = digest.items
    .filter((item) => (item.importance ?? 0) > 0.5)
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
  const existing = cache.get<NewsSummary & { headlineHash: string }>(CK.newsSummary(cityId));
  if (existing && existing.headlineHash === headlineHash) return;

  const items = topItems.map((item) => ({ title: item.title, description: item.description }));
  const result = await summarizeHeadlines(cityName, items, lang);
  if (!result) return;

  const summary: NewsSummary & { headlineHash: string } = {
    briefing: result.summary,
    generatedAt: new Date().toISOString(),
    headlineCount: items.length,
    cached: result.cached,
    headlineHash,
  };

  cache.set(CK.newsSummary(cityId), summary, SUMMARY_TTL);

  if (db) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
      await saveSummary(db, cityId, summary, model, { input: result.inputTokens, output: result.outputTokens });
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: summary generated (${items.length} headlines)`);
}
