# News & AI Summarization

## Feed Ingestion

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-feeds.ts`) — Runs every 10 minutes. Fetches RSS/Atom feeds from city-configured sources (7 feeds for Berlin across 3 tiers). Parses with `fast-xml-parser`, deduplicates by URL+title hash, sorts by tier → importance (desc) → recency. **Before LLM filtering, loads existing assessments from DB** — only genuinely new items (hash not in DB) are sent through the LLM filter. The LLM assigns `category`, `relevant_to_city`, and `importance` (0–1). After filtering, writes to cache keys `{cityId}:news:digest` and `{cityId}:news:{category}` (TTL 900s), then persists all items with their assessments to Postgres via UPSERT (dedup on cityId+hash). Uses in-flight coalescing via `cache.fetch()` to avoid re-fetching the same feed within 20 min (TTL 1200s).

2. **API** (`packages/server/src/routes/news.ts`) — `GET /api/:city/news/digest` returns cached digest, falls back to Postgres (with `applyDropLogic`), then empty structure.

3. **Frontend** (`packages/web/src/components/strips/NewsStrip.tsx`) — Uses `useNewsDigest()` hook (refetch 5 min). Category tabs (All, Transit, Politics, Culture, Crime, Economy, Sports); "local" and "weather" categories hidden from tabs but items still shown under "All". Max 10 items per view.

### Feed Configuration

Feeds are defined in city config files (e.g. `packages/server/src/config/cities/berlin.ts`). Each feed has:
- `name`, `url`, `tier` (1=primary, 2=secondary, 3=tertiary), `type` ('rss'|'atom'), `lang`, optional `category` override

Berlin has 7 feeds: rbb24, Tagesspiegel, Berliner Morgenpost, Berliner Zeitung, taz Berlin, Polizei Berlin (category=crime), Gründerszene.

Feed status (checked 2026-09-24):

- **BZ Berlin: removed 2026-09-24 for licensing; do not re-add it.** A working feed exists (`/feed/berlin.xml`), but BZ's RSL licence (`/rsl.xml`, linked from `robots.txt`) prohibits `ai-input`, and every news item here goes through the LLM classifier.
- **Exberliner: removed 2026-09-24.** It rebranded as The Berliner and no longer publishes a feed; every WordPress feed URL 302s to the homepage.
- taz: `!p<id>` picks the section and the path slug is cosmetic. Berlin is `!p4649`; the old `!p4610` was the Öko section.
- rbb24 notes in its feed that the content is for non-commercial sites only and must not be archived. `robots.txt` reserves AI training but allows retrieval/grounding with attribution.

Use Node's `fetch` to probe a feed, not curl. Some CDN front ends (BZ's Akamai, for one) return 403 to curl even for the homepage, but serve Node's fetch, which is what production uses.

### Favicons

News source favicons are self-hosted in `packages/web/public/favicons/`. When adding a new feed source:

1. Add the source name → slug mapping to `FAVICON_SLUGS` in `packages/web/src/components/strips/NewsStrip.tsx`
2. Add the slug → domain mapping to `FAVICON_SOURCES` in `packages/web/scripts/fetch-favicons.ts`
3. Run `npx tsx packages/web/scripts/fetch-favicons.ts` to download the favicon
4. Commit the new `.png` file from `packages/web/public/favicons/`

### Ingestion Constraints

- Per-feed timeout: 8s
- Overall deadline: 25s (stops fetching more feeds if exceeded)
- Batch concurrency: 10 feeds at once
- Raw feed XML cached separately (TTL 1200s) to avoid redundant fetches across cron cycles

### RSS Parser (`packages/server/src/lib/rss-parser.ts`)

Supports RSS 2.0 and Atom formats. Returns normalized `FeedItem[]` with title, url, publishedAt, description, imageUrl. Decodes numeric (`&#228;`) and common HTML (`&nbsp;`) character references (`htmlEntities: true`) — rbb24 encodes umlauts that way. RSS 1.0 (RDF) is not supported.
## AI Summarization

### Data Flow

1. **Summarization** (`packages/server/src/cron/summarize.ts`) — Runs every 6 hours (at :05 past), per active city, passing the city's config so the prompt gets its local time. Skipped if `OPENAI_API_KEY` not set. Takes up to 25 items with importance 0.5 or above (`selectBriefingItems` / `meetsBriefingCutoff`) from the cached news digest, in digest order. The cut-off includes 0.5 because the prompt's rubric calls 0.5–0.6 "significant" and GPT-6 Luna scores such stories exactly 0.5 — with `> 0.5` Luna halved the briefing pool. Passes titles + descriptions for richer context. Hashes the top 10 headlines to detect changes — skips API call if headlines unchanged since last summary. **Generates briefings in all languages configured for the city** (e.g. de/en/tr/ar for Berlin) in a single LLM call via structured output. Writes to cache key `{cityId}:news:summary` (TTL 86400s / 24h) and persists one row per language to Postgres with token counts.

2. **API** (`packages/server/src/routes/news.ts`) — `GET /api/:city/news/summary?lang=<code>` returns the briefing for the requested language, falling back to the city's primary language. The `lang` param is validated against `city.languages`. The response carries a machine-readable AI marker: `aiGenerated` (true whenever `briefing` has text) and `generator` (the model id that wrote it, carried in `NewsSummary.model` from generation, or from `ai_summaries.model` on a DB fallback). Keep both on any new path that serves briefing text; they are the interim Art. 50(2) measure in `ai-transparency.md`.

3. **Frontend** — Uses `useNewsSummary(cityId, i18n.language)` hook (refetch 60 min). Passes the user's selected language to the API. When the user switches language, React Query fetches the briefing in the new language. `BriefingStrip` puts `data-ai-generated="true"` on the element holding the text (invisible; the visible label is the `AiLabel` tag in the tile heading, see `ai-transparency.md`).

### LLM Integration (`packages/server/src/lib/openai.ts`, `llm-client.ts`, `llm-prompts.ts`)

- **Layout:** `openai.ts` holds the three pipelines (batching, index checks, geocoding, usage tracking). `llm-client.ts` decides model + effort per call site and makes the one structured call (`invokeStructured`). `llm-prompts.ts` holds the prompts and schemas behind request builders, so production and the model-eval harness send identical prompts.
- **Client:** LangChain `ChatOpenAI` with Zod-validated structured output (`.withStructuredOutput(zodSchema, { includeRaw: true })`, default `jsonSchema` method — never `functionCalling`, which GPT-6 only supports at effort `none`)
- **Model + effort per call site:** summaries `OPENAI_MODEL` (default `gpt-6-luna`) + `OPENAI_SUMMARY_EFFORT` (default `high`); news classification `OPENAI_FILTER_MODEL` (default `gpt-6-luna`) + `OPENAI_FILTER_EFFORT` (default `medium`); police locations `OPENAI_GEO_MODEL` (falls back to `OPENAI_FILTER_MODEL`, then `gpt-6-luna`) + `OPENAI_GEO_EFFORT` (default `none`). News and police defaults come from the 2026-09-24 eval's rules, the briefing's from the owner's blind rating (Luna at high preferred on 5 of 5 rated items). Defaults and valid values per model family: see `server.md` → Environment Variables.
- **Structured output schemas:** `BriefingSchema` (dynamic — one key per configured language, e.g. `{ briefings: { de: string, en: string, tr: string, ar: string } }`), `FilterResultSchema` (index, relevant_to_city, category, importance, locationLabel), `GeoResultSchema` (index, locationLabel)
- **Index check:** filter and police responses are numbered 0-based. `checkBatchIndices` rejects a whole response if any index is non-integer or out of range (the signature of a model counting from 1 — every verdict would land on its neighbour). A rejected news batch counts as failed and is retried next run; a rejected police response returns `null`. Duplicate indices: first occurrence wins.
- **System prompt:** Local news editor for [city], two short paragraphs separated by a blank line, focus on daily-life impact, write in all configured languages in one response.
  - **Current time:** the prompt gives the local weekday, date and time (`formatLocalMoment`, the city's `timezone`), and says to treat a transit disruption from earlier in the day as over. Without it, models guessed the weekday ("start of the week" on a Wednesday). The eval passes each input's window end as that time.
  - **Blank line between paragraphs:** the dashboard (`BriefingStrip`) splits paragraphs only on blank lines. Before the prompt asked for one, 70% of eval briefings used a single newline, which renders as one block.
  - **Length:** the owner wants about 160 words per language (140–190), but the prompt asks for ~140 (`BRIEFING_PROMPT_WORDS`). GPT-6 Luna at high effort writes 15–30% more than it is asked for: on 2026-09-24, asking ~160 gave de 171–197 and en 189–210 words, and stating "140–190" made it longer still (de 194–253). Asking ~140 gave de 150–172, en 168–194, tr 140–157, ar 157–172. If you change the model or effort, re-measure with `npm run eval:models -- --briefing-check` (see `model-eval.md`). English always runs longest.
- **Location extraction:** Filter prompt pushes LLM for district/neighborhood-level specificity (not bare city names). Includes examples mapping organizations to known addresses (e.g. "Senat" -> "Rotes Rathaus, Mitte"). Post-processing discards labels that are just the bare city name or "city, country" format before geocoding.
- **Usage tracking:** In-memory per-city totals (input/output tokens, call count). Exposed via `getUsageStats()` on the health endpoint.
- **Cost estimate:** per-model prices in `MODEL_PRICING` (`llm-client.ts`); unknown models fall back to $1.00/$4.00 per 1M tokens
- **Timing:** Logs duration + token counts per call via logger

## Key Types

```typescript
interface NewsItem {
  id: string;           // FNV-1a hash of URL + title
  title: string;
  url: string;
  publishedAt: string;
  sourceName: string;
  sourceUrl: string;
  description?: string;
  category: string;     // LLM-assigned (transit, crime, politics, culture, economy, sports, local)
  tier: number;         // 1 (primary) to 3 (tertiary)
  lang: string;
  location?: { lat: number; lon: number; label?: string };
  importance?: number;  // 0–1, LLM-assigned (0.5 default for unassessed)
}

// Extended type with LLM assessment, used for DB persistence
type PersistedNewsItem = NewsItem & {
  assessment?: { relevant_to_city?: boolean; importance?: number; category?: string };
}

interface NewsDigest {
  items: NewsItem[];
  categories: Record<string, NewsItem[]>;
  updatedAt: string;
}

interface NewsSummary {
  briefings: Record<string, string>;  // keyed by language code (de, en, tr, ar)
  generatedAt: string;
  headlineCount: number;
  cached: boolean;
  model: string;                      // model that wrote the briefings → API `generator`
}
```

## DB Schema

- `newsItems` table — cityId, hash (dedup key via unique index `news_city_hash_idx`), title, url, publishedAt, sourceName, sourceUrl, description, category, tier, lang, relevantToCity (bool), importance (real, 0–1), lat, lon, locationLabel, fetchedAt. UPSERT on (cityId, hash). 3-day retention (`cron/data-retention.ts`). Reads limited to 500 rows.
- `aiSummaries` table — cityId, lang, headlineHash, summary, model, inputTokens, outputTokens, generatedAt. One row per language per generation batch (rows share the same generatedAt). INSERT-only. Retention at most 7 days (`cron/data-retention.ts`); the same job also deletes a city's briefings once that city has no `newsItems` rows left. `headlineHash` is only the change detector for the top-10 briefing titles (`cron/summarize.ts`), not a reference to any `newsItems.hash`: never join the two tables on it. Until 2026-09-25 the orphan cleanup did exactly that, and so deleted every stored briefing on each run.

## Drop Logic

`applyDropLogic()` (exported from `ingest-feeds.ts`) filters out items the LLM assessed as irrelevant. Shared by the cron job, warm-cache, and the digest route. Drops all items where `relevant_to_city === false`. Items without assessment default to importance 0.5. Map markers require importance >= 0.5; the briefing requires importance >= 0.5 (see AI Summarization).
