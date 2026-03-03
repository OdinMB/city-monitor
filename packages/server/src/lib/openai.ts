/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * OpenAI client for news summarization, relevance filtering, and geolocation.
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
          content: `You are a local news editor writing a brief daily digest for ${cityName}. From the headlines below, write 4-5 bullet points (use "- " prefix) covering the most important local developments. Focus on what directly affects daily life in ${cityName} — transit, weather, safety, local politics. Aim for ~80 words total. Write in ${language}. If nothing is locally relevant, respond with a single dash: -`,
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

export interface FilteredItem {
  index: number;
  relevant: boolean;
  confidence: number;
  lat?: number;
  lon?: number;
  locationLabel?: string;
}

interface LlmFilterResult {
  index: number;
  relevant: boolean;
  confidence: number;
  locationLabel?: string;
}

export async function filterAndGeolocateNews(
  cityId: string,
  cityName: string,
  items: Array<{ title: string; description?: string; sourceName: string }>,
): Promise<FilteredItem[] | null> {
  const openai = getClient();
  if (!openai || items.length === 0) return null;

  const filterModel = process.env.OPENAI_FILTER_MODEL || 'gpt-5-nano';

  try {
    log.info(`filtering ${items.length} items for ${cityName}…`);
    const start = performance.now();

    const itemList = items
      .map((item, i) => `${i}. [${item.sourceName}] ${item.title}${item.description ? ` — ${item.description.slice(0, 100)}` : ''}`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: filterModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a local news editor for ${cityName}. For each headline below, determine:
1. Is this news item specifically about ${cityName} or its immediate region? (relevant: true/false)
2. How confident are you? (confidence: 0.0–1.0)
3. If the item mentions a specific location in ${cityName}, extract the location name (street, landmark, neighborhood). Do NOT generate coordinates.

National/international news should be marked relevant:false UNLESS it has a concrete local angle.
Respond ONLY with JSON: {"items":[{"index":0,"relevant":true,"confidence":0.9,"locationLabel":"Alexanderplatz, Mitte"},...]}`
        },
        { role: 'user', content: itemList },
      ],
    });

    const ms = Math.round(performance.now() - start);
    const inTok = response.usage?.prompt_tokens ?? 0;
    const outTok = response.usage?.completion_tokens ?? 0;
    log.info(`${cityName} filter: done in ${ms}ms (${inTok}in/${outTok}out tokens)`);

    // Track usage
    const cityKey = cityId;
    if (!usage[cityKey]) usage[cityKey] = { input: 0, output: 0, calls: 0 };
    usage[cityKey].input += inTok;
    usage[cityKey].output += outTok;
    usage[cityKey].calls += 1;

    const content = response.choices[0]?.message?.content?.trim() ?? '';
    const parsed = JSON.parse(content) as { items: LlmFilterResult[] };
    const llmItems = parsed.items ?? [];

    // Resolve location names to coordinates via Nominatim
    const { geocode } = await import('./geocode.js');
    const results: FilteredItem[] = [];
    for (const item of llmItems) {
      const result: FilteredItem = {
        index: item.index,
        relevant: item.relevant,
        confidence: item.confidence,
        locationLabel: item.locationLabel,
      };

      if (item.locationLabel) {
        const geo = await geocode(item.locationLabel, cityName);
        if (geo) {
          result.lat = geo.lat;
          result.lon = geo.lon;
        }
      }

      results.push(result);
    }

    return results;
  } catch (err) {
    log.error(`filter failed for ${cityName}`, err);
    return null;
  }
}

export interface GeolocatedReport {
  index: number;
  lat?: number;
  lon?: number;
  locationLabel?: string;
}

export async function geolocateReports(
  cityId: string,
  cityName: string,
  reports: Array<{ title: string; description?: string }>,
): Promise<GeolocatedReport[] | null> {
  const openai = getClient();
  if (!openai || reports.length === 0) return null;

  const filterModel = process.env.OPENAI_FILTER_MODEL || 'gpt-5-nano';

  try {
    log.info(`geolocating ${reports.length} reports for ${cityName}…`);
    const start = performance.now();

    const reportList = reports
      .map((r, i) => `${i}. ${r.title}${r.description ? ` — ${r.description.slice(0, 150)}` : ''}`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: filterModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a location extractor for ${cityName}. For each police report, extract the most specific location name mentioned (street, intersection, landmark, neighborhood). Do NOT generate coordinates — only extract the location text. If no location is identifiable, return null for locationLabel.
Respond ONLY with JSON: {"items":[{"index":0,"locationLabel":"Alexanderplatz, Mitte"},...]}`
        },
        { role: 'user', content: reportList },
      ],
    });

    const ms = Math.round(performance.now() - start);
    const inTok = response.usage?.prompt_tokens ?? 0;
    const outTok = response.usage?.completion_tokens ?? 0;
    log.info(`${cityName} geocode: done in ${ms}ms (${inTok}in/${outTok}out tokens)`);

    const cityKey = cityId;
    if (!usage[cityKey]) usage[cityKey] = { input: 0, output: 0, calls: 0 };
    usage[cityKey].input += inTok;
    usage[cityKey].output += outTok;
    usage[cityKey].calls += 1;

    const content = response.choices[0]?.message?.content?.trim() ?? '';
    const parsed = JSON.parse(content) as { items: Array<{ index: number; locationLabel?: string }> };
    const llmItems = parsed.items ?? [];

    // Resolve location names to coordinates via Nominatim
    const { geocode } = await import('./geocode.js');
    const results: GeolocatedReport[] = [];
    for (const item of llmItems) {
      const result: GeolocatedReport = {
        index: item.index,
        locationLabel: item.locationLabel,
      };

      if (item.locationLabel) {
        const geo = await geocode(item.locationLabel, cityName);
        if (geo) {
          result.lat = geo.lat;
          result.lon = geo.lon;
        }
      }

      results.push(result);
    }

    return results;
  } catch (err) {
    log.error(`geocode failed for ${cityName}`, err);
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
