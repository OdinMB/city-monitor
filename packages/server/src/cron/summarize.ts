/**
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
  briefings: Record<string, string>;
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
        await summarizeCityNews(city.id, city.name, city.languages, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function summarizeCityNews(
  cityId: string,
  cityName: string,
  langs: string[],
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

  const effectiveLangs = langs.length > 0 ? langs : ['en'];
  const items = topItems.map((item) => ({ title: item.title, description: item.description }));
  const result = await summarizeHeadlines(cityName, items, effectiveLangs);
  if (!result) return;

  const summary: NewsSummary & { headlineHash: string } = {
    briefings: result.briefings,
    generatedAt: new Date().toISOString(),
    headlineCount: items.length,
    cached: result.cached,
    headlineHash,
  };

  cache.set(CK.newsSummary(cityId), summary, SUMMARY_TTL);

  if (db) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
      const generatedAt = new Date();
      for (const [lang, text] of Object.entries(result.briefings)) {
        await saveSummary(db, cityId, lang, { briefing: text, headlineCount: items.length, headlineHash }, model, { input: result.inputTokens, output: result.outputTokens }, generatedAt);
      }
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: summary generated (${items.length} headlines, ${effectiveLangs.length} langs)`);
}
