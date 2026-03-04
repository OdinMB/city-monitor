/**
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

const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German',
  en: 'English',
  tr: 'Turkish',
  ar: 'Arabic',
};

export async function summarizeHeadlines(
  cityName: string,
  items: Array<{ title: string; description?: string }>,
  langs: string[],
): Promise<{ briefings: Record<string, string>; cached: boolean; inputTokens: number; outputTokens: number } | null> {
  if (!isConfigured() || langs.length === 0) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';

  const langDescriptions = langs
    .map((l) => `"${l}": ${LANGUAGE_NAMES[l] ?? l}`)
    .join(', ');

  const briefingShape = z.object(
    Object.fromEntries(langs.map((l) => [
      l,
      z.string().describe(`The editorial briefing in ${LANGUAGE_NAMES[l] ?? l}`),
    ])) as Record<string, z.ZodString>,
  );
  const BriefingSchema = z.object({ briefings: briefingShape });

  try {
    log.info(`summarizing ${items.length} headlines for ${cityName} in [${langs.join(', ')}]…`);
    const start = performance.now();

    const structured = getModel(model).withStructuredOutput(BriefingSchema, { includeRaw: true });

    const itemList = items
      .map((item, i) => `${i + 1}. ${item.title}${item.description ? ` — ${item.description.slice(0, 120)}` : ''}`)
      .join('\n');

    const result = await structured.invoke([
      new SystemMessage(`You are a local news editor writing a brief daily digest for ${cityName}. Write exactly two short paragraphs in an editorial voice that weave together the most important local developments from the stories below. Don't just list headlines — synthesize, contextualize, and highlight what matters most for daily life in ${cityName} (transit, safety, local politics, weather). Aim for ~120 words per language. Write the briefing in each of these languages: ${langDescriptions}. Return an object with keys: ${langs.join(', ')}. If nothing is locally relevant, use a single dash (-) for that language.`),
      new HumanMessage(itemList),
    ]);

    const ms = Math.round(performance.now() - start);
    const raw = result.raw as AIMessage;
    const inTok = raw.usage_metadata?.input_tokens ?? 0;
    const outTok = raw.usage_metadata?.output_tokens ?? 0;
    log.info(`${cityName}: done in ${ms}ms (${inTok}in/${outTok}out tokens)`);

    trackUsage(cityName.toLowerCase(), inTok, outTok);

    return {
      briefings: result.parsed.briefings,
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

/** Items per LLM request — small batches yield more reliable structured output. */
const LLM_BATCH_SIZE = 10;

function buildFilterPrompt(cityName: string): string {
  return `You are a local news editor for ${cityName}. For each headline below, determine:

1. **relevant_to_city** (true/false): Is this specifically about ${cityName} or its immediate region? National/international news = false UNLESS it has a concrete local angle.
2. **category**: Classify into exactly one of: local, politics, transit, culture, crime, weather, economy, sports. Use "local" as fallback if unclear.
3. **importance** (0.0–1.0): How significant is this news for the city as a whole? Rate based on how many residents are affected or how much it shapes the city's trajectory — NOT on how dramatic or emotional the headline sounds.
   - 0.0–0.2: Routine filler — minor openings, generic announcements, press releases with no public impact, individual incidents (a single traffic accident, a single crime, one person injured/killed)
   - 0.3–0.4: Mildly noteworthy — small infrastructure changes, minor cultural events, routine policy updates, individual crime reports, localized incidents affecting a small area
   - 0.5–0.6: Significant — major transit disruptions, political decisions with real impact, notable economic developments, new city statistics or reports (unemployment, population, housing)
   - 0.7–0.8: Very important — major policy changes, large-scale infrastructure projects, events affecting large parts of the city, trends in crime/safety statistics, significant economic shifts
   - 0.9–1.0: Critical/breaking — city-wide emergencies, disasters, events requiring immediate public attention
   NOTE: Individual crimes, accidents, or deaths are inherently LOCAL incidents (0.0–0.4) unless they reveal a city-wide pattern or trigger systemic change. Crime statistics, policy responses, or serial patterns rate higher.
4. **locationLabel** (string, try VERY hard — we need this for map markers): Extract or infer the most specific location in ${cityName} for this news item. Use every possible clue:
   - **Explicit mentions**: street names, landmarks, neighborhoods, districts, transit stations, buildings, parks, rivers, bridges, squares
   - **Institutions/orgs**: map them to their physical address (e.g. "Senat" → "Rotes Rathaus, Mitte", "BVG" → "Holzmarktstraße, Mitte", "Charité" → "Charitéplatz, Mitte", "FU Berlin" → "Dahlem", "TU Berlin" → "Charlottenburg", "Olympiastadion" → "Westend", "Philharmonie" → "Tiergarten", "Berlinale" → "Potsdamer Platz", "Zoo" → "Tiergarten", "Tierpark" → "Friedrichsfelde")
   - **Source feed context**: If the news source typically covers a specific area (e.g. "Berliner Woche Spandau" → Spandau, "Neukölln Blog" → Neukölln), use that district as a fallback
   - **Topic-based inference**: Transit line disruptions → the affected station/route area; construction → the mentioned street/area; local politics → the district government involved; school/hospital names → their neighborhood
   - **Last resort**: If the news clearly relates to ${cityName} but you can only narrow it to a Bezirk/borough, return that district name (e.g. "Spandau", "Reinickendorf"). A district-level location is FAR better than nothing.
   IMPORTANT: Never return just "${cityName}" or the bare city name — always go to at least district/neighborhood level. Only omit locationLabel if the news is truly city-wide with no geographic anchor at all (e.g. "Berlin unemployment rate rises" or "citywide transit strike").`;
}

/**
 * Classify a single batch of items via the LLM.
 * Items use local 0-based indices within the batch; the caller maps them
 * back to global indices.
 */
async function classifyBatch(
  structured: ReturnType<ChatOpenAI['withStructuredOutput']>,
  systemPrompt: string,
  batchItems: Array<{ title: string; description?: string; sourceName: string }>,
): Promise<{ items: z.infer<typeof FilterResultSchema>['items']; inTok: number; outTok: number }> {
  const itemList = batchItems
    .map((item, i) => `${i}. [${item.sourceName}] ${item.title}${item.description ? `\n   ${item.description.slice(0, 300)}` : ''}`)
    .join('\n');

  const result = await structured.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(itemList),
  ]);

  const raw = result.raw as AIMessage;
  return {
    items: result.parsed.items,
    inTok: raw.usage_metadata?.input_tokens ?? 0,
    outTok: raw.usage_metadata?.output_tokens ?? 0,
  };
}

export async function filterAndGeolocateNews(
  cityId: string,
  cityName: string,
  items: Array<{ title: string; description?: string; sourceName: string }>,
): Promise<FilteredItem[] | null> {
  if (!isConfigured() || items.length === 0) return null;

  const filterModel = process.env.OPENAI_FILTER_MODEL || 'gpt-5-nano';

  try {
    log.info(`filtering ${items.length} items for ${cityName} (batch size ${LLM_BATCH_SIZE})…`);
    const start = performance.now();

    const structured = getModel(filterModel).withStructuredOutput(FilterResultSchema, { includeRaw: true });
    const systemPrompt = buildFilterPrompt(cityName);

    // Split items into batches and run LLM requests in parallel
    const batches: Array<{ startIndex: number; batchItems: typeof items }> = [];
    for (let i = 0; i < items.length; i += LLM_BATCH_SIZE) {
      batches.push({ startIndex: i, batchItems: items.slice(i, i + LLM_BATCH_SIZE) });
    }

    const batchResults = await Promise.all(
      batches.map(async ({ startIndex, batchItems }) => {
        try {
          const result = await classifyBatch(structured, systemPrompt, batchItems);
          // Remap local batch indices to global indices
          return {
            items: result.items.map((item) => ({ ...item, index: item.index + startIndex })),
            inTok: result.inTok,
            outTok: result.outTok,
          };
        } catch (err) {
          log.error(`${cityName} batch at index ${startIndex} failed`, err);
          return { items: [] as z.infer<typeof FilterResultSchema>['items'], inTok: 0, outTok: 0 };
        }
      }),
    );

    // Merge results from all batches
    const allLlmItems = batchResults.flatMap((r) => r.items);
    const totalInTok = batchResults.reduce((sum, r) => sum + r.inTok, 0);
    const totalOutTok = batchResults.reduce((sum, r) => sum + r.outTok, 0);

    const ms = Math.round(performance.now() - start);
    log.info(`${cityName} filter: done in ${ms}ms — ${batches.length} batches (${totalInTok}in/${totalOutTok}out tokens)`);

    trackUsage(cityId, totalInTok, totalOutTok);

    // Resolve location names to coordinates via Nominatim
    const { geocode } = await import('./geocode.js');
    const cityLower = cityName.toLowerCase();
    const results: FilteredItem[] = [];
    for (const item of allLlmItems) {
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
