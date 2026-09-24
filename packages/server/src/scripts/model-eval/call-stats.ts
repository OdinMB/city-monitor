/**
 * Per-call statistics shared by every eval site: failure classification,
 * reliability counts, latency, tokens and cost — plus the small numeric and
 * junk-text helpers the site scorers build on.
 */

import type { CallRecord, FailureKind } from './arms.js';

/** Nearest-rank percentile; 0 for an empty list. */
function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1]!;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** count / total, or 0 when there is nothing to count over. */
export function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

const REPLACEMENT_CHAR = String.fromCodePoint(0xfffd);

function isControlChar(ch: string, allowWhitespace: boolean): boolean {
  const code = ch.codePointAt(0)!;
  if (allowWhitespace && (ch === '\n' || ch === '\r' || ch === '\t')) return false;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/** Control characters, U+FFFD, or leaked special tokens / escape sequences. */
export function hasJunkCharacters(text: string, allowWhitespace: boolean): boolean {
  if (text.includes(REPLACEMENT_CHAR) || text.includes('<|') || text.includes('\\u')) return true;
  return [...text].some((ch) => isControlChar(ch, allowWhitespace));
}

/**
 * Classify a response that did not parse. LangChain 1.2.11 does not surface
 * `message.refusal` on Chat Completions, so a refusal shows up as empty content.
 * A length stop wins over empty content: reasoning can burn the whole budget.
 */
export function classifyFailure(raw: { content: unknown; finishReason: string | null }): Exclude<FailureKind, 'api'> {
  if (raw.finishReason === 'length') return 'truncated';
  const empty = raw.content === '' || raw.content == null || (Array.isArray(raw.content) && raw.content.length === 0);
  return empty ? 'refusal' : 'parse';
}

export interface CallStats {
  apiErrors: number;
  refusals: number;
  truncated: number;
  parseErrors: number;
  p50Ms: number;
  p95Ms: number;
  meanInTok: number;
  meanOutTok: number;
  meanReasoningTok: number;
  /** Over calls that got an answer (API errors are not billed). */
  costPerCall: number;
  totalCost: number;
}

export function callStats(records: readonly CallRecord[]): CallStats {
  const count = (kind: FailureKind) => records.filter((r) => r.error === kind).length;
  const answered = records.filter((r) => r.error !== 'api');
  const totalCost = records.reduce((sum, r) => sum + r.costUsd, 0);
  return {
    apiErrors: count('api'),
    refusals: count('refusal'),
    truncated: count('truncated'),
    parseErrors: count('parse'),
    p50Ms: percentile(answered.map((r) => r.ms), 50),
    p95Ms: percentile(answered.map((r) => r.ms), 95),
    meanInTok: mean(answered.map((r) => r.inTok)),
    meanOutTok: mean(answered.map((r) => r.outTok)),
    meanReasoningTok: mean(answered.map((r) => r.reasoningTok)),
    costPerCall: ratio(totalCost, answered.length),
    totalCost,
  };
}
