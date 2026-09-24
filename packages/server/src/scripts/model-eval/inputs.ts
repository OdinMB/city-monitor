/**
 * Fetch the live evaluation samples (Berlin news feeds, police releases, an
 * optional SELECT-only police top-up from the DB) and build the briefing
 * inputs the summarize job would have seen.
 */

import type { NewsItem } from '@city-monitor/shared';
import { berlin } from '../../config/cities/berlin.js';
import { parseFeed } from '../../lib/rss-parser.js';
import { hashString } from '../../lib/hash.js';
import { createLogger } from '../../lib/logger.js';
import { compareDigestOrder, applyDropLogic } from '../../cron/ingest-feeds.js';
import { selectBriefingItems } from '../../cron/summarize.js';
import type { PersistedNewsItem } from '../../db/writes.js';
import type { NormalizedVerdict } from './extraction-scoring.js';

const log = createLogger('model-eval');

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'CityMonitor/1.0 (model-eval)';
const MAX_NEWS = 300;
const MAX_POLICE = 100;
const DB_TOP_UP_LIMIT = 200;

export interface PoliceSample {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  source: 'feed' | 'db';
}

export interface EvalInputs {
  fetchedAt: string;
  /** In production order (tier, then newest). */
  news: NewsItem[];
  /** Newest first. */
  police: PoliceSample[];
  sources: {
    feeds: Array<{ name: string; items: number; ok: boolean }>;
    policeFeed: number;
    policeDb: number;
    dbTopUp: string;
  };
}

// ---------------------------------------------------------------------------
// Live samples
// ---------------------------------------------------------------------------

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await log.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const byNewest = (a: { publishedAt: string }, b: { publishedAt: string }) =>
  (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0);

/** Every Berlin feed, mapped like `fetchOneFeed`, deduped, newest `max` in production order. */
async function collectNews(max: number): Promise<{ items: NewsItem[]; feeds: EvalInputs['sources']['feeds'] }> {
  const results = await Promise.all(berlin.feeds.map(async (feed) => {
    const xml = await fetchText(feed.url);
    const items = xml === null ? [] : parseFeed(xml).map((fi): NewsItem => ({
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
    return { feed, items, ok: xml !== null };
  }));

  const unique = new Map<string, NewsItem>();
  for (const { items } of results) {
    for (const it of items) if (!unique.has(it.id)) unique.set(it.id, it);
  }
  const newest = [...unique.values()].sort(byNewest).slice(0, max);
  newest.sort((a, b) => a.tier - b.tier || byNewest(a, b));

  return {
    items: newest,
    feeds: results.map(({ feed, items, ok }) => ({ name: feed.name, items: items.length, ok })),
  };
}

async function collectPoliceFeed(): Promise<PoliceSample[]> {
  const url = berlin.dataSources.police?.url;
  const xml = url ? await fetchText(url) : null;
  if (xml === null) return [];
  return parseFeed(xml).map((item) => ({
    id: hashString(item.url + item.title),
    title: item.title,
    description: item.description || '',
    publishedAt: item.publishedAt,
    source: 'feed' as const,
  }));
}

/** Error class plus the driver's code (e.g. ECONNREFUSED, 42P01) — never the message. */
function describeDbError(err: unknown): string {
  const name = err instanceof Error ? err.constructor.name : typeof err;
  const cause = err instanceof Error ? err.cause : undefined;
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : undefined;
  const causeName = cause instanceof Error ? cause.constructor.name : undefined;
  return [name, causeName, code].filter(Boolean).join(' / ');
}

/**
 * One SELECT of explicit columns — never `loadSafetyReports`, which selects
 * every schema column and would fail on a database that lacks a newly added
 * column. Logs the error class only: driver messages can name the host.
 */
async function topUpPoliceFromDb(): Promise<{ reports: PoliceSample[]; status: string }> {
  if (!process.env.DATABASE_URL) return { reports: [], status: 'skipped (DATABASE_URL not set)' };

  const { createDb } = await import('../../db/index.js');
  const { safetyReports } = await import('../../db/schema.js');
  const { eq, desc } = await import('drizzle-orm');

  const conn = createDb();
  if (!conn) return { reports: [], status: 'skipped (no DB connection)' };
  try {
    const rows = await conn.db
      .select({
        hash: safetyReports.hash,
        title: safetyReports.title,
        description: safetyReports.description,
        publishedAt: safetyReports.publishedAt,
      })
      .from(safetyReports)
      .where(eq(safetyReports.cityId, berlin.id))
      .orderBy(desc(safetyReports.publishedAt))
      .limit(DB_TOP_UP_LIMIT);
    return {
      reports: rows.map((row) => ({
        id: row.hash,
        title: row.title,
        description: row.description ?? '',
        publishedAt: row.publishedAt?.toISOString() ?? '',
        source: 'db' as const,
      })),
      status: `used (${rows.length} rows read)`,
    };
  } catch (err) {
    const reason = describeDbError(err);
    log.warn(`DB top-up failed (${reason}) — continuing with the live feed only`);
    return { reports: [], status: `failed (${reason})` };
  } finally {
    await conn.client.end({ timeout: 5 });
  }
}

export async function collectInputs(limits: { news?: number; police?: number } = {}): Promise<EvalInputs> {
  const maxNews = limits.news ?? MAX_NEWS;
  const maxPolice = limits.police ?? MAX_POLICE;
  const fetchedAt = new Date().toISOString();

  const [news, policeFeed] = await Promise.all([collectNews(maxNews), collectPoliceFeed()]);

  let dbReports: PoliceSample[] = [];
  let dbTopUp = `not needed (${policeFeed.length} reports in the feed)`;
  if (policeFeed.length < maxPolice) {
    const topUp = await topUpPoliceFromDb();
    dbReports = topUp.reports;
    dbTopUp = topUp.status;
  }

  const merged = new Map<string, PoliceSample>();
  for (const report of [...policeFeed, ...dbReports]) if (!merged.has(report.id)) merged.set(report.id, report);
  const police = [...merged.values()].sort(byNewest).slice(0, maxPolice);

  return {
    fetchedAt,
    news: news.items,
    police,
    sources: {
      feeds: news.feeds,
      policeFeed: police.filter((p) => p.source === 'feed').length,
      policeDb: police.filter((p) => p.source === 'db').length,
      dbTopUp,
    },
  };
}

// ---------------------------------------------------------------------------
// Briefing inputs
// ---------------------------------------------------------------------------

export interface BriefingInput {
  id: string;
  /** ISO end of the 24h window. */
  windowEnd: string;
  /** What the summarize job would send, in order. */
  items: Array<{ title: string; description?: string }>;
}

const WINDOW_STEP_MS = 4 * 3_600_000;
const WINDOW_SPAN_MS = 24 * 3_600_000;
const MIN_ITEMS = 8;
const MAX_WINDOWS = 6;
const MAX_TOP_OVERLAP = 0.7;
const TOP_FOR_OVERLAP = 10;

function withVerdict(item: NewsItem, verdict: NormalizedVerdict | undefined): PersistedNewsItem {
  if (!verdict) return { ...item };
  return { ...item, category: verdict.category, assessment: { ...verdict } };
}

/** What the summarize job would see for the items published in (end − 24h, end]. */
function briefingItemsFor(window: NewsItem[], verdicts: ReadonlyMap<string, NormalizedVerdict>): NewsItem[] {
  const assessed = window.map((item) => withVerdict(item, verdicts.get(item.id)));
  assessed.sort(compareDigestOrder);
  return selectBriefingItems(applyDropLogic(assessed));
}

/**
 * Briefing inputs from sliding 24h windows ending at `now`, `now − 4h`, … back
 * to the oldest item. A window is kept if it yields at least 8 briefing items
 * and its top 10 shares under 70% of titles with every window already kept.
 * Undated items count only for the `now` window. At most 6, newest first.
 */
export function buildBriefingInputs(
  items: readonly NewsItem[],
  verdicts: ReadonlyMap<string, NormalizedVerdict>,
  now: Date,
): BriefingInput[] {
  const dated = items.map((item) => ({ item, t: Date.parse(item.publishedAt) }));
  const times = dated.map((d) => d.t).filter(Number.isFinite);
  const oldest = times.length > 0 ? Math.min(...times) : now.getTime();

  const kept: Array<{ input: BriefingInput; top: Set<string> }> = [];
  for (let k = 0; kept.length < MAX_WINDOWS; k++) {
    const end = now.getTime() - k * WINDOW_STEP_MS;
    if (k > 0 && end < oldest) break;

    const inWindow = dated
      .filter(({ t }) => (Number.isFinite(t) ? t > end - WINDOW_SPAN_MS && (t <= end || k === 0) : k === 0))
      .map(({ item }) => item);
    const selected = briefingItemsFor(inWindow, verdicts);
    if (selected.length < MIN_ITEMS) continue;

    const top = new Set(selected.slice(0, TOP_FOR_OVERLAP).map((i) => i.title));
    const overlaps = (other: Set<string>) => [...top].filter((t) => other.has(t)).length / top.size;
    if (kept.some((k2) => overlaps(k2.top) >= MAX_TOP_OVERLAP)) continue;

    kept.push({
      input: {
        id: `in${kept.length + 1}`,
        windowEnd: new Date(end).toISOString(),
        items: selected.map((i) => (i.description ? { title: i.title, description: i.description } : { title: i.title })),
      },
      top,
    });
  }
  return kept.map((k) => k.input);
}
