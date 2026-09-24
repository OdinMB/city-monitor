/**
 * LLM pipelines for news summarization, relevance filtering, and geolocation:
 * batching, index checks, geocoding of extracted labels, and usage tracking.
 * Model selection and the call path live in llm-client.ts; prompts and
 * schemas in llm-prompts.ts.
 */

import { createLogger } from './logger.js';
import { resolveSiteTarget, invokeStructured, describeTarget, estimateCostUsd, type ModelTarget } from './llm-client.js';
import { buildBriefingRequest, buildFilterRequest, buildGeoRequest, VALID_CATEGORIES, type FilterResult } from './llm-prompts.js';

const log = createLogger('openai');

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

interface UsageEntry {
  model: string;
  input: number;
  output: number;
  calls: number;
}

const usage: Record<string, UsageEntry> = {};

function trackUsage(key: string, model: string, input: number, output: number): void {
  const compositeKey = `${model}:${key}`;
  if (!usage[compositeKey]) usage[compositeKey] = { model, input: 0, output: 0, calls: 0 };
  usage[compositeKey].input += input;
  usage[compositeKey].output += output;
  usage[compositeKey].calls += 1;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Discard bare city-name labels that would resolve to city center. */
export function stripBareCityLabel(label: string | null | undefined, cityLower: string): string | undefined {
  if (!label) return undefined;
  const lower = label.toLowerCase().trim();
  if (lower === cityLower || lower.startsWith(cityLower + ',') || lower.startsWith(cityLower + ' (')) {
    return undefined;
  }
  return label;
}

export type BatchIndexCheck<T> =
  | { ok: true; items: T[]; duplicates: number }
  | { ok: false; reason: string };

/**
 * Validate the item indices of one model response against a request of `n`
 * items numbered 0..n-1.
 *
 * Any non-integer or out-of-range index rejects the whole response: it is the
 * signature of a numbering shift (e.g. a model counting from 1), and then every
 * other verdict in the response belongs to a neighbouring item. Dropping only
 * the bad index would lose the last item and still mis-assign the rest.
 * On a duplicate index the first occurrence wins.
 */
export function checkBatchIndices<T extends { index: number }>(items: readonly T[], n: number): BatchIndexCheck<T> {
  const invalid = items.filter((item) => !Number.isInteger(item.index) || item.index < 0 || item.index >= n);
  if (invalid.length > 0) {
    return { ok: false, reason: `${invalid.length} of ${items.length} indices outside 0..${n - 1} (first: ${invalid[0]!.index})` };
  }
  const seen = new Set<number>();
  const kept: T[] = [];
  for (const item of items) {
    if (seen.has(item.index)) continue;
    seen.add(item.index);
    kept.push(item);
  }
  return { ok: true, items: kept, duplicates: items.length - kept.length };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ---------------------------------------------------------------------------
// Briefing summarization
// ---------------------------------------------------------------------------

export async function summarizeHeadlines(
  cityName: string,
  items: Array<{ title: string; description?: string }>,
  langs: string[],
): Promise<{ briefings: Record<string, string>; cached: boolean; inputTokens: number; outputTokens: number; model: string } | null> {
  if (!isConfigured() || langs.length === 0) return null;

  const target = resolveSiteTarget('summary');

  try {
    log.info(`summarizing ${items.length} headlines for ${cityName} in [${langs.join(', ')}] with ${describeTarget(target)}…`);

    const result = await invokeStructured(target, buildBriefingRequest(cityName, items, langs));
    log.info(`${cityName}: done in ${result.ms}ms (${result.inTok}in/${result.outTok}out tokens)`);

    trackUsage(cityName.toLowerCase(), target.model, result.inTok, result.outTok);

    if (!result.parsed) {
      log.error(`summarization for ${cityName} returned an unparseable response`);
      return null;
    }

    return {
      briefings: result.parsed.briefings,
      cached: false,
      inputTokens: result.inTok,
      outputTokens: result.outTok,
      model: target.model,
    };
  } catch (err) {
    log.error(`summarization failed for ${cityName}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// News relevance filtering + geolocation
// ---------------------------------------------------------------------------

export interface FilteredItem {
  index: number;
  relevant_to_city: boolean;
  category: string;
  importance: number;
  lat?: number;
  lon?: number;
  locationLabel?: string;
}

/** Items per LLM request — small batches yield more reliable structured output. */
export const LLM_BATCH_SIZE = 10;

type FilterVerdict = FilterResult['items'][number];

interface BatchOutcome {
  items: FilterVerdict[];
  inTok: number;
  outTok: number;
}

/**
 * Classify one batch. The model numbers items 0-based within the batch; a
 * response that fails the index check yields no items, so the batch is
 * retried next run like a failed call.
 */
async function classifyBatch(
  target: ModelTarget,
  cityName: string,
  batchItems: Array<{ title: string; description?: string; sourceName: string }>,
  startIndex: number,
): Promise<BatchOutcome> {
  const result = await invokeStructured(target, buildFilterRequest(cityName, batchItems));
  const tokens = { inTok: result.inTok, outTok: result.outTok };

  if (!result.parsed) {
    log.error(`${cityName} batch at index ${startIndex}: unparseable response`);
    return { items: [], ...tokens };
  }

  const checked = checkBatchIndices(result.parsed.items, batchItems.length);
  if (!checked.ok) {
    log.error(`${cityName} batch at index ${startIndex} rejected: ${checked.reason}`);
    return { items: [], ...tokens };
  }
  if (checked.duplicates > 0) {
    log.warn(`${cityName} batch at index ${startIndex}: ignored ${checked.duplicates} duplicate indices`);
  }

  // Remap local batch indices to global indices
  return { items: checked.items.map((item) => ({ ...item, index: item.index + startIndex })), ...tokens };
}

export async function filterAndGeolocateNews(
  cityId: string,
  cityName: string,
  items: Array<{ title: string; description?: string; sourceName: string }>,
): Promise<FilteredItem[] | null> {
  if (!isConfigured() || items.length === 0) return null;

  const target = resolveSiteTarget('filter');

  try {
    log.info(`filtering ${items.length} items for ${cityName} with ${describeTarget(target)} (batch size ${LLM_BATCH_SIZE})…`);
    const start = performance.now();

    // Split items into batches and run LLM requests in parallel
    const batches: Array<{ startIndex: number; batchItems: typeof items }> = [];
    for (let i = 0; i < items.length; i += LLM_BATCH_SIZE) {
      batches.push({ startIndex: i, batchItems: items.slice(i, i + LLM_BATCH_SIZE) });
    }

    const batchResults = await Promise.all(
      batches.map(async ({ startIndex, batchItems }): Promise<BatchOutcome> => {
        try {
          return await classifyBatch(target, cityName, batchItems, startIndex);
        } catch (err) {
          log.error(`${cityName} batch at index ${startIndex} failed`, err);
          return { items: [], inTok: 0, outTok: 0 };
        }
      }),
    );

    // Merge results from all batches
    const allLlmItems = batchResults.flatMap((r) => r.items);
    const totalInTok = batchResults.reduce((sum, r) => sum + r.inTok, 0);
    const totalOutTok = batchResults.reduce((sum, r) => sum + r.outTok, 0);

    const ms = Math.round(performance.now() - start);
    log.info(`${cityName} filter: done in ${ms}ms — ${batches.length} batches (${totalInTok}in/${totalOutTok}out tokens)`);

    trackUsage(cityId, target.model, totalInTok, totalOutTok);

    // Resolve location names to coordinates via Nominatim
    const { geocode } = await import('./geocode.js');
    const cityLower = cityName.toLowerCase();
    const results: FilteredItem[] = [];
    // Serial loop is intentional: Nominatim enforces a strict 1 QPS rate limit,
    // so parallel requests would be rejected. See geocode.ts for the rate-limiter.
    for (const item of allLlmItems) {
      const category = VALID_CATEGORIES.has(item.category) ? item.category : 'local';
      const importance = Math.max(0, Math.min(1, item.importance));

      const label = stripBareCityLabel(item.locationLabel, cityLower);

      const filtered: FilteredItem = {
        index: item.index,
        relevant_to_city: item.relevant_to_city,
        category,
        importance,
        locationLabel: label,
      };

      if (label) {
        const geo = await geocode(label, cityName);
        if (geo) {
          filtered.lat = geo.lat;
          filtered.lon = geo.lon;
        }
      }

      results.push(filtered);
    }

    return results;
  } catch (err) {
    log.error(`filter failed for ${cityName}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Safety report geolocation
// ---------------------------------------------------------------------------

export interface GeolocatedReport {
  index: number;
  lat?: number;
  lon?: number;
  locationLabel?: string;
}

/**
 * Extract a location label per report and geocode it. Returns null when the
 * call fails or the response fails the index check — callers must then treat
 * every report as not attempted.
 */
export async function geolocateReports(
  cityId: string,
  cityName: string,
  reports: Array<{ title: string; description?: string }>,
): Promise<GeolocatedReport[] | null> {
  if (!isConfigured() || reports.length === 0) return null;

  const target = resolveSiteTarget('geo');

  try {
    log.info(`geolocating ${reports.length} reports for ${cityName} with ${describeTarget(target)}…`);

    const result = await invokeStructured(target, buildGeoRequest(cityName, reports));
    log.info(`${cityName} geocode: done in ${result.ms}ms (${result.inTok}in/${result.outTok}out tokens)`);

    trackUsage(cityId, target.model, result.inTok, result.outTok);

    if (!result.parsed) {
      log.error(`${cityName} geocode: unparseable response`);
      return null;
    }

    const checked = checkBatchIndices(result.parsed.items, reports.length);
    if (!checked.ok) {
      log.error(`${cityName} geocode response rejected: ${checked.reason}`);
      return null;
    }

    // Resolve location names to coordinates via Nominatim
    const { geocode } = await import('./geocode.js');
    const cityLower = cityName.toLowerCase();
    const results: GeolocatedReport[] = [];
    for (const item of checked.items) {
      const label = stripBareCityLabel(item.locationLabel, cityLower);

      const geoResult: GeolocatedReport = {
        index: item.index,
        locationLabel: label,
      };

      if (label) {
        const geo = await geocode(label, cityName);
        if (geo) {
          geoResult.lat = geo.lat;
          geoResult.lon = geo.lon;
        }
      }

      results.push(geoResult);
    }

    return results;
  } catch (err) {
    log.error(`geocode failed for ${cityName}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Usage stats (exposed via /health endpoint)
// ---------------------------------------------------------------------------

export function getUsageStats(): Record<string, UsageEntry & { estimatedCostUsd: number }> {
  const result: Record<string, UsageEntry & { estimatedCostUsd: number }> = {};
  for (const [key, entry] of Object.entries(usage)) {
    const cost = estimateCostUsd(entry.model, entry.input, entry.output);
    result[key] = { ...entry, estimatedCostUsd: Math.round(cost * 10000) / 10000 };
  }
  return result;
}
