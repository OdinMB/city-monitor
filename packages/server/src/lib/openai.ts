/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * LLM client for news summarization, relevance filtering, and geolocation.
 * Uses LangChain's ChatOpenAI with Zod-validated structured output.
 */

import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { createLogger } from './logger.js';

const log = createLogger('openai');

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

interface UsageEntry {
  input: number;
  output: number;
  calls: number;
}

const usage: Record<string, UsageEntry> = {};

function trackUsage(cityKey: string, input: number, output: number): void {
  if (!usage[cityKey]) usage[cityKey] = { input: 0, output: 0, calls: 0 };
  usage[cityKey].input += input;
  usage[cityKey].output += output;
  usage[cityKey].calls += 1;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function getModel(modelName: string): ChatOpenAI {
  return new ChatOpenAI({ model: modelName });
}

// ---------------------------------------------------------------------------
// Briefing summarization
// ---------------------------------------------------------------------------

const BriefingSchema = z.object({
  briefing: z.string().describe('The editorial briefing text (two paragraphs)'),
});

export async function summarizeHeadlines(
  cityName: string,
  items: Array<{ title: string; description?: string }>,
  lang: string,
): Promise<{ summary: string; cached: boolean; inputTokens: number; outputTokens: number } | null> {
  if (!isConfigured()) return null;

  const language = lang === 'de' ? 'German' : 'English';
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';

  try {
    log.info(`summarizing ${items.length} headlines for ${cityName}…`);
    const start = performance.now();

    const structured = getModel(model).withStructuredOutput(BriefingSchema, { includeRaw: true });

    const itemList = items
      .map((item, i) => `${i + 1}. ${item.title}${item.description ? ` — ${item.description.slice(0, 120)}` : ''}`)
      .join('\n');

    const result = await structured.invoke([
      new SystemMessage(`You are a local news editor writing a brief daily digest for ${cityName}. Write exactly two short paragraphs in an editorial voice that weave together the most important local developments from the stories below. Don't just list headlines — synthesize, contextualize, and highlight what matters most for daily life in ${cityName} (transit, safety, local politics, weather). Aim for ~120 words total. Write in ${language}. If nothing is locally relevant, respond with a single dash: -`),
      new HumanMessage(itemList),
    ]);

    const ms = Math.round(performance.now() - start);
    const raw = result.raw as AIMessage;
    const inTok = raw.usage_metadata?.input_tokens ?? 0;
    const outTok = raw.usage_metadata?.output_tokens ?? 0;
    log.info(`${cityName}: done in ${ms}ms (${inTok}in/${outTok}out tokens)`);

    trackUsage(cityName.toLowerCase(), inTok, outTok);

    return {
      summary: result.parsed.briefing,
      cached: false,
      inputTokens: inTok,
      outputTokens: outTok,
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

const FilterResultSchema = z.object({
  items: z.array(z.object({
    index: z.number(),
    relevant_to_city: z.boolean(),
    category: z.string(),
    importance: z.number(),
    locationLabel: z.string().nullable(),
  })),
});

const VALID_CATEGORIES = new Set(['local', 'politics', 'transit', 'culture', 'crime', 'weather', 'economy', 'sports']);

export async function filterAndGeolocateNews(
  cityId: string,
  cityName: string,
  items: Array<{ title: string; description?: string; sourceName: string }>,
): Promise<FilteredItem[] | null> {
  if (!isConfigured() || items.length === 0) return null;

  const filterModel = process.env.OPENAI_FILTER_MODEL || 'gpt-5-nano';

  try {
    log.info(`filtering ${items.length} items for ${cityName}…`);
    const start = performance.now();

    const structured = getModel(filterModel).withStructuredOutput(FilterResultSchema, { includeRaw: true });

    const itemList = items
      .map((item, i) => `${i}. [${item.sourceName}] ${item.title}${item.description ? ` — ${item.description.slice(0, 100)}` : ''}`)
      .join('\n');

    const result = await structured.invoke([
      new SystemMessage(`You are a local news editor for ${cityName}. For each headline below, determine:

1. **relevant_to_city** (true/false): Is this specifically about ${cityName} or its immediate region? National/international news = false UNLESS it has a concrete local angle.
2. **category**: Classify into exactly one of: local, politics, transit, culture, crime, weather, economy, sports. Use "local" as fallback if unclear.
3. **importance** (0.0–1.0): How significant is this news for people living in ${cityName}?
   - 0.0–0.2: Routine filler — minor openings, generic announcements, press releases with no public impact
   - 0.3–0.4: Mildly noteworthy — small infrastructure changes, minor cultural events, routine policy updates
   - 0.5–0.6: Significant — major transit disruptions, notable crime incidents, political decisions with real impact
   - 0.7–0.8: Very important — large emergencies, major policy changes, events affecting large parts of the city
   - 0.9–1.0: Critical/breaking — city-wide emergencies, disasters, events requiring immediate public attention
4. **locationLabel** (string, try hard): Extract or infer the most specific location in ${cityName} relevant to this news item. Look for: explicit street names, landmarks, neighborhoods, districts, transit stations, buildings, parks. If the headline mentions an organization or institution based in ${cityName}, use their known address or neighborhood (e.g. "Senat" → "Rotes Rathaus, Mitte", "BVG" → "Holzmarktstraße, Mitte"). If the news source name implies a district (e.g., "Kreuzberg Blog"), use that district. IMPORTANT: Never return just "${cityName}" or the bare city name as the location — that is useless for mapping. Always go at least to district/neighborhood level (e.g. "Mitte", "Kreuzberg", "Altona"). Omit the field entirely if you truly cannot determine any specific area within the city.`),
      new HumanMessage(itemList),
    ]);

    const ms = Math.round(performance.now() - start);
    const raw = result.raw as AIMessage;
    const inTok = raw.usage_metadata?.input_tokens ?? 0;
    const outTok = raw.usage_metadata?.output_tokens ?? 0;
    log.info(`${cityName} filter: done in ${ms}ms (${inTok}in/${outTok}out tokens)`);

    trackUsage(cityId, inTok, outTok);

    const llmItems = result.parsed.items;

    // Resolve location names to coordinates via Nominatim
    const { geocode } = await import('./geocode.js');
    const cityLower = cityName.toLowerCase();
    const results: FilteredItem[] = [];
    for (const item of llmItems) {
      const category = VALID_CATEGORIES.has(item.category) ? item.category : 'local';
      const importance = Math.max(0, Math.min(1, item.importance));

      // Discard bare city name labels — they resolve to city center and are useless
      let label = item.locationLabel ?? undefined;
      if (label) {
        const lower = label.toLowerCase().trim();
        if (lower === cityLower || lower.startsWith(cityLower + ',') || lower.startsWith(cityLower + ' (')) {
          label = undefined;
        }
      }

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

const GeoResultSchema = z.object({
  items: z.array(z.object({
    index: z.number(),
    locationLabel: z.string().nullable(),
  })),
});

export async function geolocateReports(
  cityId: string,
  cityName: string,
  reports: Array<{ title: string; description?: string }>,
): Promise<GeolocatedReport[] | null> {
  if (!isConfigured() || reports.length === 0) return null;

  const filterModel = process.env.OPENAI_FILTER_MODEL || 'gpt-5-nano';

  try {
    log.info(`geolocating ${reports.length} reports for ${cityName}…`);
    const start = performance.now();

    const structured = getModel(filterModel).withStructuredOutput(GeoResultSchema, { includeRaw: true });

    const reportList = reports
      .map((r, i) => `${i}. ${r.title}${r.description ? ` — ${r.description.slice(0, 150)}` : ''}`)
      .join('\n');

    const result = await structured.invoke([
      new SystemMessage(`You are a location extractor for ${cityName}. For each police report, extract the most specific location name mentioned (street, intersection, landmark, neighborhood). Do NOT generate coordinates — only extract the location text. If no location is identifiable, omit the locationLabel field.`),
      new HumanMessage(reportList),
    ]);

    const ms = Math.round(performance.now() - start);
    const raw = result.raw as AIMessage;
    const inTok = raw.usage_metadata?.input_tokens ?? 0;
    const outTok = raw.usage_metadata?.output_tokens ?? 0;
    log.info(`${cityName} geocode: done in ${ms}ms (${inTok}in/${outTok}out tokens)`);

    trackUsage(cityId, inTok, outTok);

    const llmItems = result.parsed.items;

    // Resolve location names to coordinates via Nominatim
    const { geocode } = await import('./geocode.js');
    const cityLower = cityName.toLowerCase();
    const results: GeolocatedReport[] = [];
    for (const item of llmItems) {
      // Discard bare city name labels — they resolve to city center and are useless
      let label = item.locationLabel ?? undefined;
      if (label) {
        const lower = label.toLowerCase().trim();
        if (lower === cityLower || lower.startsWith(cityLower + ',') || lower.startsWith(cityLower + ' (')) {
          label = undefined;
        }
      }

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
  for (const [city, entry] of Object.entries(usage)) {
    // Rough cost estimate for gpt-5-mini: $1.00/1M input, $4.00/1M output
    const cost = (entry.input * 0.000001) + (entry.output * 0.000004);
    result[city] = { ...entry, estimatedCostUsd: Math.round(cost * 10000) / 10000 };
  }
  return result;
}
