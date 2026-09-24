/**
 * Which arms each call site tests, and how to run them: one structured call
 * per request through the production call path, and geocoding of the labels
 * the extraction arms return. Also the volume and token assumptions behind
 * the cost estimate.
 */

import {
  invokeStructured, estimateCostUsd, describeTarget, defaultSiteTarget,
  type LlmRequest, type LlmSite, type ModelTarget, type ReasoningEffort,
} from '../../lib/llm-client.js';
import { geocode, clearGeocodeCache } from '../../lib/geocode.js';
import { createLogger } from '../../lib/logger.js';
import { classifyFailure } from './call-stats.js';
import type { GeoPoint } from './extraction-scoring.js';

const log = createLogger('model-eval');

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

export type SiteId = 'news' | 'police' | 'briefing';
export type ArmRole = 'baseline' | 'candidate' | 'fallback';

export interface Arm {
  /** `model@effort` — also the arm's label in every eval file. */
  id: string;
  site: SiteId;
  role: ArmRole;
  target: ModelTarget;
}

function arm(site: SiteId, role: ArmRole, model: string, effort?: ReasoningEffort): Arm {
  const target: ModelTarget = effort ? { model, effort } : { model };
  return { id: describeTarget(target), site, role, target };
}

/** Per site: baseline (today's production), then candidates and fallbacks cheapest first. */
export const ARMS: Record<SiteId, readonly Arm[]> = {
  news: [
    arm('news', 'baseline', 'gpt-5-nano'),
    arm('news', 'candidate', 'gpt-6-luna', 'low'),
    arm('news', 'candidate', 'gpt-6-luna', 'medium'),
    arm('news', 'fallback', 'gpt-5.6-luna', 'low'),
    arm('news', 'fallback', 'gpt-5.6-luna', 'medium'),
  ],
  police: [
    arm('police', 'baseline', 'gpt-5-nano'),
    arm('police', 'candidate', 'gpt-6-luna', 'none'),
    arm('police', 'candidate', 'gpt-6-luna', 'low'),
    arm('police', 'fallback', 'gpt-5.6-luna', 'none'),
    arm('police', 'fallback', 'gpt-5.6-luna', 'low'),
  ],
  briefing: [
    arm('briefing', 'baseline', 'gpt-5-mini'),
    arm('briefing', 'candidate', 'gpt-6-luna', 'medium'),
    arm('briefing', 'candidate', 'gpt-6-luna', 'high'),
    arm('briefing', 'candidate', 'gpt-6-sol', 'low'),
    arm('briefing', 'candidate', 'gpt-6-sol', 'medium'),
  ],
};

export function armsFor(site: SiteId, role: ArmRole): Arm[] {
  return ARMS[site].filter((a) => a.role === role);
}

export function baselineOf(site: SiteId): Arm {
  return armsFor(site, 'baseline')[0]!;
}

const LLM_SITE: Record<SiteId, LlmSite> = { news: 'filter', police: 'geo', briefing: 'summary' };

/**
 * What production runs at `site` when no env var overrides it: the code
 * defaults in llm-client.ts. Unlike the `ARMS` baselines, this follows the
 * code, so a `--briefing-check` run always tests the current default.
 */
export function productionArm(site: SiteId): Arm {
  const target = defaultSiteTarget(LLM_SITE[site]);
  return arm(site, 'baseline', target.model, target.effort);
}

/** Monthly production calls per site, for $/month. */
export const VOLUME: Record<SiteId, number> = {
  // Inventory estimate: 3k–4.5k filter calls a month. Eval batches are full (10 items)
  // while production averages ~2.5 new items per call, so $/month is an upper bound.
  news: 3750,
  // One call per 10-minute run (6 × 24 × 30) before the geo_attempted fix; lower after it.
  police: 4320,
  // Roughly 4 briefing regenerations a day (headline hash changes) × 30.
  briefing: 120,
};

/** Police reports per eval call. Production sends every unplaced report in one call. */
export const POLICE_CHUNK = 10;

/** Deliberately high per-call token assumptions for the pre-run estimate. */
const ASSUMED_TOKENS: Record<SiteId, { input: number; output: number }> = {
  news: { input: 2500, output: 3000 },
  police: { input: 1500, output: 2000 },
  briefing: { input: 2000, output: 6000 },
};

/** Stable key for an arm across sites (the same model@effort runs on several sites). */
export function armKey(a: Arm): string {
  return `${a.site}:${a.id}`;
}

/** Worst-case cost per arm for the given number of calls per site. */
export function estimateRunCost(
  callsPerSite: Record<SiteId, number>,
  arms: readonly Arm[],
): { total: number; perArm: Map<string, number> } {
  const perArm = new Map<string, number>();
  for (const a of arms) {
    const tokens = ASSUMED_TOKENS[a.site];
    perArm.set(armKey(a), callsPerSite[a.site] * estimateCostUsd(a.target.model, tokens.input, tokens.output));
  }
  const total = [...perArm.values()].reduce((sum, v) => sum + v, 0);
  return { total, perArm };
}

// ---------------------------------------------------------------------------
// Running an arm
// ---------------------------------------------------------------------------

export type FailureKind = 'api' | 'refusal' | 'truncated' | 'parse';

export interface CallRecord<T = unknown> {
  site: SiteId;
  arm: string;
  requestId: string;
  /** Sample ids in the order they were numbered in the prompt. */
  inputIds: string[];
  ms: number;
  inTok: number;
  outTok: number;
  reasoningTok: number;
  costUsd: number;
  finishReason: string | null;
  error?: FailureKind;
  errorMessage?: string;
  parsed?: T;
}

export interface EvalRequest<T extends Record<string, unknown>> {
  requestId: string;
  inputIds: string[];
  request: LlmRequest<T>;
}

export interface ArmRun<T> {
  records: CallRecord<T>[];
  /** Set when the arm's first call hit an API error; its remaining calls were skipped. */
  unusable?: string;
}

const CALL_TIMEOUT_MS = 180_000;
const CONCURRENCY = 4;

/** Error text for the eval files, with anything that looks like an API key masked. */
function describeError(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.replace(/sk-[A-Za-z0-9_*.-]+/g, 'sk-***').slice(0, 300);
}

async function callOnce<T extends Record<string, unknown>>(a: Arm, req: EvalRequest<T>): Promise<CallRecord<T>> {
  const base = { site: a.site, arm: a.id, requestId: req.requestId, inputIds: req.inputIds };
  const start = performance.now();
  try {
    const result = await invokeStructured(a.target, req.request, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    const rawFinish = result.raw.response_metadata?.finish_reason;
    const finishReason = typeof rawFinish === 'string' ? rawFinish : null;
    const record: CallRecord<T> = {
      ...base,
      ms: result.ms,
      inTok: result.inTok,
      outTok: result.outTok,
      reasoningTok: result.raw.usage_metadata?.output_token_details?.reasoning ?? 0,
      costUsd: estimateCostUsd(a.target.model, result.inTok, result.outTok),
      finishReason,
    };
    return result.parsed
      ? { ...record, parsed: result.parsed }
      : { ...record, error: classifyFailure({ content: result.raw.content, finishReason }) };
  } catch (err) {
    return {
      ...base,
      ms: Math.round(performance.now() - start),
      inTok: 0,
      outTok: 0,
      reasoningTok: 0,
      costUsd: 0,
      finishReason: null,
      error: 'api',
      errorMessage: describeError(err),
    };
  }
}

/**
 * Run every request of one arm. The first call runs alone; if it is an API
 * error the arm is unusable and the rest are skipped. Then 4 calls at a time.
 */
export async function runArm<T extends Record<string, unknown>>(
  a: Arm,
  requests: readonly EvalRequest<T>[],
  onRecord: (record: CallRecord<T>) => void,
): Promise<ArmRun<T>> {
  if (requests.length === 0) return { records: [] };
  log.info(`${a.site} ${a.id}: ${requests.length} calls`);

  const records: CallRecord<T>[] = [];
  const run = async (req: EvalRequest<T>) => {
    const record = await callOnce(a, req);
    records.push(record);
    onRecord(record);
    return record;
  };

  const first = await run(requests[0]!);
  if (first.error === 'api') {
    log.warn(`${a.site} ${a.id}: first call failed — arm marked unusable`);
    return { records, unusable: first.errorMessage ?? 'API error' };
  }

  let cursor = 1;
  const worker = async () => {
    while (cursor < requests.length) {
      await run(requests[cursor++]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, requests.length - 1) }, worker));
  return { records };
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

/**
 * Geocode labels not yet in `known`, one at a time (Nominatim, 1 req/s).
 * `geocode()` caches a provider HTTP error as a permanent miss, so misses are
 * retried once after clearing its cache — a transient 429 must not count
 * against the arm that produced the label.
 */
export async function geocodeLabels(
  labels: Iterable<string>,
  cityName: string,
  known: Map<string, GeoPoint | null>,
): Promise<void> {
  const pending = [...new Set(labels)].filter((label) => !known.has(label));
  if (pending.length === 0) return;
  log.info(`geocoding ${pending.length} new labels (~${Math.ceil(pending.length * 1.1)}s)…`);

  const lookup = async (label: string) => {
    const result = await geocode(label, cityName);
    return result ? { lat: result.lat, lon: result.lon } : null;
  };

  for (const [i, label] of pending.entries()) {
    known.set(label, await lookup(label));
    if ((i + 1) % 50 === 0) log.info(`geocoded ${i + 1}/${pending.length}`);
  }

  const misses = pending.filter((label) => known.get(label) === null);
  if (misses.length === 0) return;
  clearGeocodeCache();
  log.info(`retrying ${misses.length} misses once…`);
  for (const label of misses) {
    const point = await lookup(label);
    if (point) known.set(label, point);
  }
}
