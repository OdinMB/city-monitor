/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * OpenAI client for news summarization.
 *
 * Adapted from World Monitor (AGPL-3.0)
 * Original: server/worldmonitor/news/v1/summarize-article.ts
 *           server/worldmonitor/news/v1/_shared.ts
 * Copyright (C) 2024-2026 Elie Habib
 *
 * Modifications:
 * - Uses official openai npm package instead of raw fetch
 * - City-scoped prompts instead of global news summarization
 * - Simplified token tracking (per-city daily totals)
 */

import OpenAI from 'openai';
import { createLogger } from './logger.js';

const log = createLogger('openai');

interface UsageEntry {
  input: number;
  output: number;
  calls: number;
}

const usage: Record<string, UsageEntry> = {};

let client: OpenAI | null = null;

export function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function getClient(): OpenAI | null {
  if (!isConfigured()) return null;
  if (!client) {
    client = new OpenAI();
  }
  return client;
}

export async function summarizeHeadlines(
  cityName: string,
  headlines: string[],
  lang: string,
): Promise<{ summary: string; cached: boolean; inputTokens: number; outputTokens: number } | null> {
  const openai = getClient();
  if (!openai) return null;

  const language = lang === 'de' ? 'German' : 'English';

  try {
    log.info(`summarizing ${headlines.length} headlines for ${cityName}…`);
    const start = performance.now();

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      reasoning_effort: 'low',
      messages: [
        {
          role: 'system',
          content: `You are a local news editor for ${cityName}. From the headlines below, pick ONLY those that directly affect ${cityName} or its immediate region. National or international news should only be included if it has a concrete local impact on ${cityName} residents (e.g. a federal policy affecting the city). Ignore general sports results from other cities, generic national politics, and events in other regions. Summarize the locally relevant headlines into 2-3 sentences focused on what affects daily life — transit, weather, local politics, safety, cultural events. Be factual and concise. Write in ${language}. If no headlines are relevant to ${cityName}, respond with a single dash: -`,
        },
        {
          role: 'user',
          content: headlines.map((h, i) => `${i + 1}. ${h}`).join('\n'),
        },
      ],
    });

    const ms = Math.round(performance.now() - start);
    const inTok = response.usage?.prompt_tokens ?? 0;
    const outTok = response.usage?.completion_tokens ?? 0;
    log.info(`${cityName}: done in ${ms}ms (${inTok}in/${outTok}out tokens)`);

    const summary = response.choices[0]?.message?.content?.trim() ?? '';

    // Track usage
    const cityKey = cityName.toLowerCase();
    if (!usage[cityKey]) {
      usage[cityKey] = { input: 0, output: 0, calls: 0 };
    }
    usage[cityKey].input += inTok;
    usage[cityKey].output += outTok;
    usage[cityKey].calls += 1;

    return {
      summary,
      cached: false,
      inputTokens: inTok,
      outputTokens: outTok,
    };
  } catch (err) {
    log.error(`summarization failed for ${cityName}`, err);
    return null;
  }
}

export function getUsageStats(): Record<string, UsageEntry & { estimatedCostUsd: number }> {
  const result: Record<string, UsageEntry & { estimatedCostUsd: number }> = {};
  for (const [city, entry] of Object.entries(usage)) {
    // Rough cost estimate for gpt-5-mini: $1.00/1M input, $4.00/1M output
    const cost = (entry.input * 0.000001) + (entry.output * 0.000004);
    result[city] = { ...entry, estimatedCostUsd: Math.round(cost * 10000) / 10000 };
  }
  return result;
}
