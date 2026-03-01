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
): Promise<{ summary: string; cached: boolean } | null> {
  const openai = getClient();
  if (!openai) return null;

  const language = lang === 'de' ? 'German' : 'English';

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.3,
      max_tokens: 150,
      top_p: 0.9,
      messages: [
        {
          role: 'system',
          content: `You are a local news editor for ${cityName}. Summarize the following headlines into a 2-3 sentence briefing for residents. Focus on what affects daily life — transit, weather, local politics, safety, cultural events. Be factual and concise. Write in ${language}.`,
        },
        {
          role: 'user',
          content: headlines.map((h, i) => `${i + 1}. ${h}`).join('\n'),
        },
      ],
    });

    const summary = response.choices[0]?.message?.content?.trim() ?? '';

    // Track usage
    const cityKey = cityName.toLowerCase();
    if (!usage[cityKey]) {
      usage[cityKey] = { input: 0, output: 0, calls: 0 };
    }
    usage[cityKey].input += response.usage?.prompt_tokens ?? 0;
    usage[cityKey].output += response.usage?.completion_tokens ?? 0;
    usage[cityKey].calls += 1;

    return { summary, cached: false };
  } catch (err) {
    console.error(`[openai] summarization failed for ${cityName}:`, err);
    return null;
  }
}

export function getUsageStats(): Record<string, UsageEntry & { estimatedCostUsd: number }> {
  const result: Record<string, UsageEntry & { estimatedCostUsd: number }> = {};
  for (const [city, entry] of Object.entries(usage)) {
    // Rough cost estimate for gpt-4.1-mini: $0.40/1M input, $1.60/1M output
    const cost = (entry.input * 0.0000004) + (entry.output * 0.0000016);
    result[city] = { ...entry, estimatedCostUsd: Math.round(cost * 10000) / 10000 };
  }
  return result;
}
