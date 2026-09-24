/**
 * What the model is asked: the three prompts, their Zod schemas and how items
 * are formatted into the message. Production and the model-eval harness build
 * their requests here, so both send byte-identical prompts.
 */

import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { LlmRequest } from './llm-client.js';

// ---------------------------------------------------------------------------
// Briefing summarization
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German',
  en: 'English',
  tr: 'Turkish',
  ar: 'Arabic',
};

export type BriefingResult = { briefings: Record<string, string> };

export function buildBriefingRequest(
  cityName: string,
  items: Array<{ title: string; description?: string }>,
  langs: string[],
): LlmRequest<BriefingResult> {
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

  const itemList = items
    .map((item, i) => `${i + 1}. ${item.title}${item.description ? ` — ${item.description.slice(0, 120)}` : ''}`)
    .join('\n');

  return {
    schema: BriefingSchema,
    messages: [
      new SystemMessage(`You are a local news editor writing a brief daily digest for ${cityName}. Write exactly two short paragraphs in an editorial voice that weave together the most important local developments from the stories below. Don't just list headlines — synthesize, contextualize, and highlight what matters most for daily life in ${cityName} (transit, safety, local politics, weather). Aim for ~120 words per language. Write the briefing in each of these languages: ${langDescriptions}. Return an object with keys: ${langs.join(', ')}. If nothing is locally relevant, use a single dash (-) for that language.`),
      new HumanMessage(itemList),
    ],
  };
}

// ---------------------------------------------------------------------------
// News relevance filtering + geolocation
// ---------------------------------------------------------------------------

const FilterResultSchema = z.object({
  items: z.array(z.object({
    index: z.number(),
    relevant_to_city: z.boolean(),
    category: z.string(),
    importance: z.number(),
    locationLabel: z.string().nullable(),
  })),
});

export type FilterResult = z.infer<typeof FilterResultSchema>;

export const VALID_CATEGORIES = new Set(['local', 'politics', 'transit', 'culture', 'crime', 'weather', 'economy', 'sports']);

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
 * One classification batch. Items are numbered 0-based within the batch;
 * the caller maps them back to global indices.
 */
export function buildFilterRequest(
  cityName: string,
  batchItems: Array<{ title: string; description?: string; sourceName: string }>,
): LlmRequest<FilterResult> {
  const itemList = batchItems
    .map((item, i) => `${i}. [${item.sourceName}] ${item.title}${item.description ? `\n   ${item.description.slice(0, 300)}` : ''}`)
    .join('\n');

  return {
    schema: FilterResultSchema,
    messages: [
      new SystemMessage(buildFilterPrompt(cityName)),
      new HumanMessage(itemList),
    ],
  };
}

// ---------------------------------------------------------------------------
// Safety report geolocation
// ---------------------------------------------------------------------------

const GeoResultSchema = z.object({
  items: z.array(z.object({
    index: z.number(),
    locationLabel: z.string().nullable(),
  })),
});

export type GeoResult = z.infer<typeof GeoResultSchema>;

/** Police reports numbered 0-based. */
export function buildGeoRequest(
  cityName: string,
  reports: Array<{ title: string; description?: string }>,
): LlmRequest<GeoResult> {
  const reportList = reports
    .map((r, i) => `${i}. ${r.title}${r.description ? ` — ${r.description.slice(0, 150)}` : ''}`)
    .join('\n');

  return {
    schema: GeoResultSchema,
    messages: [
      new SystemMessage(`You are a location extractor for ${cityName}. For each police report, extract the most specific location name mentioned (street, intersection, landmark, neighborhood). Do NOT generate coordinates — only extract the location text. If no location is identifiable, omit the locationLabel field.`),
      new HumanMessage(reportList),
    ],
  };
}
