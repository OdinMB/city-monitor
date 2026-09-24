/**
 * Model selection and the single structured-output call path.
 *
 * Decides which OpenAI model and reasoning effort each LLM call site uses
 * (env vars, read at call time), builds the LangChain client, makes one
 * structured-output call, and prices tokens.
 */

import { ChatOpenAI } from '@langchain/openai';
import type { AIMessage, BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import { createLogger } from './logger.js';

const log = createLogger('llm-client');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReasoningEffort = 'minimal' | 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** The three LLM call sites. */
export type LlmSite = 'summary' | 'filter' | 'geo';

/** A model plus the reasoning effort to request. No effort = API default. */
export interface ModelTarget {
  model: string;
  effort?: ReasoningEffort;
}

/** What a call site sends: the output schema and the message list. */
export interface LlmRequest<T extends Record<string, unknown>> {
  schema: z.ZodType<T>;
  messages: BaseMessage[];
}

// ---------------------------------------------------------------------------
// Per-site configuration
// ---------------------------------------------------------------------------

interface SiteConfig {
  /** Env vars checked in order; the first non-empty one names the model. */
  modelEnv: readonly string[];
  effortEnv: string;
  defaultModel: string;
  /**
   * Sent when the effort env var is unset or invalid, whichever model the site
   * resolves to — unless that model does not support it, in which case no
   * effort is sent (the API default).
   */
  defaultEffort?: ReasoningEffort;
}

/**
 * News and police defaults come from the 2026-09-24 model eval (see
 * .context/model-eval.md). The briefing stays on gpt-5-mini until its blind
 * rating is done; that snapshot shuts down on 2026-12-11.
 */
const SITES: Record<LlmSite, SiteConfig> = {
  summary: { modelEnv: ['OPENAI_MODEL'], effortEnv: 'OPENAI_SUMMARY_EFFORT', defaultModel: 'gpt-5-mini' },
  filter: { modelEnv: ['OPENAI_FILTER_MODEL'], effortEnv: 'OPENAI_FILTER_EFFORT', defaultModel: 'gpt-6-luna', defaultEffort: 'medium' },
  geo: { modelEnv: ['OPENAI_GEO_MODEL', 'OPENAI_FILTER_MODEL'], effortEnv: 'OPENAI_GEO_EFFORT', defaultModel: 'gpt-6-luna', defaultEffort: 'none' },
};

const ALL_EFFORTS: readonly ReasoningEffort[] = ['minimal', 'none', 'low', 'medium', 'high', 'xhigh', 'max'];

/** gpt-5, gpt-5-mini, gpt-5-nano (optionally dated): no `none`, `xhigh` or `max`. */
const GPT5_EFFORTS: readonly ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];
const GPT5_FAMILY = /^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/;

/** gpt-5.<n>-* and gpt-6-*: `minimal` is rejected with a 400. */
const GPT5X_EFFORTS: readonly ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const GPT5X_FAMILY = /^(?:gpt-5\.\d+|gpt-6)(?:-|$)/;

function allowedEfforts(model: string): readonly ReasoningEffort[] {
  const id = model.toLowerCase();
  if (GPT5_FAMILY.test(id)) return GPT5_EFFORTS;
  if (GPT5X_FAMILY.test(id)) return GPT5X_EFFORTS;
  return ALL_EFFORTS;
}

function isEffort(value: string): value is ReasoningEffort {
  return (ALL_EFFORTS as readonly string[]).includes(value);
}

/**
 * Validate an effort value against the model family. Anything the API would
 * reject is logged and treated as unset, so a misconfigured env var degrades
 * to the site default instead of failing the call site on every run.
 */
function parseEffort(raw: string | undefined, model: string, envName: string): ReasoningEffort | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  if (!isEffort(value)) {
    log.warn(`${envName} is not a known reasoning effort — ignoring it`);
    return undefined;
  }
  if (!allowedEfforts(model).includes(value)) {
    log.warn(`${envName}=${value} is not supported by ${model} — ignoring it`);
    return undefined;
  }
  return value;
}

/** The site's default effort, if the model supports it. */
function defaultEffortFor(config: SiteConfig, model: string): ReasoningEffort | undefined {
  const effort = config.defaultEffort;
  return effort && allowedEfforts(model).includes(effort) ? effort : undefined;
}

/** Model and effort for a call site. Reads env at call time. */
export function resolveSiteTarget(site: LlmSite): ModelTarget {
  const config = SITES[site];
  const model = config.modelEnv.map((name) => process.env[name]).find((value) => !!value) || config.defaultModel;
  const effort = parseEffort(process.env[config.effortEnv], model, config.effortEnv) ?? defaultEffortFor(config, model);
  return effort ? { model, effort } : { model };
}

/** `model@effort`, or `model@default` when no effort is sent. */
export function describeTarget(target: ModelTarget): string {
  return `${target.model}@${target.effort ?? 'default'}`;
}

// ---------------------------------------------------------------------------
// Client construction and the structured call
// ---------------------------------------------------------------------------

/**
 * Build the chat client.
 *
 * Effort goes through `modelKwargs.reasoning_effort`, never LangChain's
 * `reasoning` option: @langchain/openai 1.2.x only treats /^o\d/ and gpt-5*
 * as reasoning models and silently drops `reasoning` for gpt-6-* IDs.
 * `maxTokens`, `temperature` and `topP` are never set: GPT-6 rejects sampling
 * parameters above effort `none`, and LangChain would send a token limit for
 * gpt-6-* as `max_tokens`, which reasoning models do not accept.
 */
export function getModel(model: string, effort?: ReasoningEffort): ChatOpenAI {
  return new ChatOpenAI(effort ? { model, modelKwargs: { reasoning_effort: effort } } : { model });
}

export interface StructuredResult<T> {
  /** Null when the response could not be parsed against the schema. */
  parsed: T | null;
  /** The raw model message — content, finish reason and usage. */
  raw: AIMessage;
  inTok: number;
  outTok: number;
  ms: number;
}

/**
 * Make one structured-output call. API errors propagate; an unparseable
 * response returns `parsed: null`.
 *
 * Uses the default `jsonSchema` method (response_format). Never switch to
 * `method: 'functionCalling'`: GPT-6 only supports Chat Completions function
 * calling at effort `none`.
 */
export async function invokeStructured<T extends Record<string, unknown>>(
  target: ModelTarget,
  request: LlmRequest<T>,
  options: { signal?: AbortSignal } = {},
): Promise<StructuredResult<T>> {
  const structured = getModel(target.model, target.effort)
    .withStructuredOutput<T>(request.schema, { includeRaw: true });

  const start = performance.now();
  const result = await structured.invoke(request.messages, { signal: options.signal });
  const ms = Math.round(performance.now() - start);

  const raw = result.raw as AIMessage;
  return {
    parsed: result.parsed ?? null,
    raw,
    inTok: raw.usage_metadata?.input_tokens ?? 0,
    outTok: raw.usage_metadata?.output_tokens ?? 0,
    ms,
  };
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** USD per 1M tokens (standard tier, cached-input discount ignored). */
export const MODEL_PRICING: Readonly<Record<string, { input: number; output: number }>> = {
  'gpt-5-nano': { input: 0.05, output: 0.40 },
  'gpt-5-mini': { input: 0.25, output: 2.00 },
  'gpt-6-luna': { input: 0.10, output: 0.50 },
  'gpt-6-sol': { input: 2.00, output: 10.00 },
  'gpt-5.6-luna': { input: 0.20, output: 1.20 },
};
export const DEFAULT_PRICING = { input: 1.00, output: 4.00 } as const;

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
