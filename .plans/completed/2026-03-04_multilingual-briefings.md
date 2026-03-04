# Multilingual Briefings

## Goal

Generate and display briefings in the user's selected language. Currently the cron job generates one briefing per city in the city's primary language (`city.languages[0]`). After this change, the cron generates one briefing **per language** configured for the city, and the frontend displays the version matching the user's selected language.

The user also requested that the city config define which languages are available (per-city, not project-wide). The frontend language switcher should respect this.

## Current State

- **Cron** (`summarize.ts`): Loops over active cities, calls `summarizeCityNews(cityId, cityName, city.languages[0], cache, db)` → single briefing per city
- **LLM** (`openai.ts:summarizeHeadlines`): Takes `lang` param, maps to `German`/`English` for the system prompt
- **Cache**: Key `{cityId}:news:summary` → single `NewsSummary` object (with `headlineHash` for dedup)
- **DB**: `ai_summaries` table has no `lang` column — stores a single summary text
- **API**: `GET /:city/news/summary` returns single briefing, no `?lang=` param
- **Frontend**: `useNewsSummary(cityId)` fetches summary without language; `BriefingStrip` renders raw `briefing` text
- **City config**: `languages: string[]` exists (Berlin/Hamburg both `['de', 'en']`), but only `[0]` is used for briefing language. Frontend has a hardcoded `LANGUAGES` array in `HeaderControls.tsx`

## Architecture

**Single LLM call per city** returning all language variants via structured output. The Zod schema changes from `{ briefing: string }` to `{ briefings: { de: string, en: string, ... } }`. One cache entry, one API endpoint with `?lang=` selection.

**Reuse existing `languages` field** in `CityConfig` — expand it to list all UI-available languages per city. No new config field needed.

**City-specific language switcher** — the frontend reads `cityConfig.languages` instead of hardcoding `DE/EN/TR/AR`.

## Changes

### 1. City Config — Expand `languages` Per City

**City config files** (server + web):
- Berlin: `languages: ['de', 'en', 'tr', 'ar']`
- Hamburg: `languages: ['de', 'en']`

**Frontend `HeaderControls.tsx`**: Replace hardcoded `LANGUAGES` array with `useCityConfig().languages`. Build buttons dynamically from that list. When user switches city, the available languages update automatically.

### 2. Server: Single-Call Multi-Language Briefing

**`NewsSummary` interface** (`summarize.ts`):
```ts
export interface NewsSummary {
  briefings: Record<string, string>;  // { de: "...", en: "...", tr: "...", ar: "..." }
  generatedAt: string;
  headlineCount: number;
  cached: boolean;
}
```

**`summarize.ts` — `summarizeCityNews`**:
- Accept `langs: string[]` instead of single `lang: string`
- Pass all languages to a single `summarizeHeadlines` call
- Use same `headlineHash` dedup — skip generation only if hash matches

**`openai.ts` — `summarizeHeadlines`**: Change to accept `langs: string[]`. Build a dynamic Zod schema with one key per language:
```ts
const BriefingSchema = z.object({
  briefings: z.object(
    Object.fromEntries(langs.map(l => [l, z.string()]))
  ),
});
```
Update the system prompt to request briefings in all specified languages at once. Expand the language name map: `de`→German, `en`→English, `tr`→Turkish, `ar`→Arabic.

### 3. DB Schema: Add `lang` Column to `ai_summaries`

**`schema.ts`**: Add `lang: text('lang').notNull().default('de')` to `aiSummaries`.

**`writes.ts` — `saveSummary`**: Accept `lang` parameter, write one row per language.

**`reads.ts` — `loadSummary`**: Load the most recent rows for a city (one per lang), return the `briefings: Record<string, string>` shape.

**Migration**: Run `db:generate` + `db:migrate` to add the column.

### 4. Cache Key — No Change

Keep `{cityId}:news:summary`. Value shape changes to use `briefings: Record<string, string>`.

**`warm-cache.ts`**: Adjust for new shape from `loadSummary`.

### 5. API: Add `?lang=` Query Parameter

**`news.ts` — `GET /:city/news/summary`**:
- Read `req.query.lang` (default to city's `languages[0]`)
- Return `{ briefing: briefings[lang] ?? briefings[city.languages[0]] ?? null, ... }`
- Response shape stays flat (single `briefing` string) — frontend type unchanged

### 6. Frontend: Pass Language to API

**`api.ts`**: Add `lang` param to `getNewsSummary`
**`useNewsSummary.ts`**: Accept `lang`, include in query key
**`BriefingStrip.tsx`**: Pass `i18n.language` to hook

## File Change Summary

| File | Change |
|---|---|
| `packages/server/src/config/cities/berlin.ts` | `languages: ['de', 'en', 'tr', 'ar']` |
| `packages/server/src/config/cities/hamburg.ts` | Keep `languages: ['de', 'en']` |
| `packages/web/src/config/cities/berlin.ts` | `languages: ['de', 'en', 'tr', 'ar']` |
| `packages/web/src/config/cities/hamburg.ts` | Keep `languages: ['de', 'en']` |
| `packages/server/src/cron/summarize.ts` | Single-call multi-lang generation, new `NewsSummary.briefings` shape |
| `packages/server/src/lib/openai.ts` | Single call returning all langs via structured output |
| `packages/server/src/db/schema.ts` | Add `lang` column to `aiSummaries` |
| `packages/server/src/db/writes.ts` | `saveSummary` takes `lang` param |
| `packages/server/src/db/reads.ts` | `loadSummary` returns multi-lang shape |
| `packages/server/src/db/warm-cache.ts` | Adjust for new shape |
| `packages/server/src/routes/news.ts` | Read `?lang=` query param, select briefing |
| `packages/web/src/lib/api.ts` | Add `lang` param to `getNewsSummary` |
| `packages/web/src/hooks/useNewsSummary.ts` | Accept `lang`, include in query key |
| `packages/web/src/components/strips/BriefingStrip.tsx` | Pass `i18n.language` to hook |
| `packages/web/src/components/layout/HeaderControls.tsx` | Dynamic language list from city config |
| Tests: `summarize.test.ts`, `summary.test.ts` | Update for new shapes |

## Cost Impact

- Single LLM call per city (same as before), just with a larger structured output
- Output tokens increase ~proportionally to number of languages (~4x for Berlin)
- Headline hash dedup still prevents re-generation when headlines haven't changed
