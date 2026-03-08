# News & AI Summarization

## Feed Ingestion

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-feeds.ts`) — Runs every 10 minutes. Fetches RSS/Atom feeds from city-configured sources (10 feeds for Berlin across 3 tiers). Parses with `fast-xml-parser`, deduplicates by URL+title hash, sorts by tier → importance (desc) → recency. **Before LLM filtering, loads existing assessments from DB** — only genuinely new items (hash not in DB) are sent through the LLM filter. The LLM assigns `category`, `relevant_to_city`, and `importance` (0–1). After filtering, writes to cache keys `{cityId}:news:digest` and `{cityId}:news:{category}` (TTL 900s), then persists all items with their assessments to Postgres via UPSERT (dedup on cityId+hash). Uses in-flight coalescing via `cache.fetch()` to avoid re-fetching the same feed within 10 min.

2. **API** (`packages/server/src/routes/news.ts`) — `GET /api/:city/news/digest` returns cached digest, falls back to Postgres (with `applyDropLogic`), then empty structure.

3. **Frontend** (`packages/web/src/components/strips/NewsStrip.tsx`) — Uses `useNewsDigest()` hook (refetch 5 min). Category tabs (All, Transit, Politics, Culture, Crime, Economy, Sports); "local" and "weather" categories hidden from tabs but items still shown under "All". Max 10 items per view.

### Feed Configuration

Feeds are defined in city config files (e.g. `packages/server/src/config/cities/berlin.ts`). Each feed has:
- `name`, `url`, `tier` (1=primary, 2=secondary, 3=tertiary), `type` ('rss'|'atom'), `lang`, optional `category` override

Berlin has 10 feeds: rbb24, Tagesspiegel, Berliner Morgenpost, BZ Berlin, Berlin.de News, Berliner Zeitung, taz Berlin, RBB Polizei (category=crime), Gründerszene, Exberliner.

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
- Raw feed XML cached separately (TTL 600s) to avoid redundant fetches

### RSS Parser (`packages/server/src/lib/rss-parser.ts`)

Supports RSS 2.0 and Atom formats. Returns normalized `FeedItem[]` with title, url, publishedAt, description, imageUrl.

## AI Summarization

### Data Flow

1. **Summarization** (`packages/server/src/cron/summarize.ts`) — Runs every 6 hours (at :05 past). Skipped if `OPENAI_API_KEY` not set. Takes up to 25 most recent items with importance > 0.5 from cached news digest. Passes titles + descriptions for richer context. Hashes the top 5 headlines to detect changes — skips API call if headlines unchanged since last summary. **Generates briefings in all languages configured for the city** (e.g. de/en/tr/ar for Berlin) in a single LLM call via structured output. Writes to cache key `{cityId}:news:summary` (TTL 86400s / 24h) and persists one row per language to Postgres with token counts.

2. **API** (`packages/server/src/routes/news.ts`) — `GET /api/:city/news/summary?lang=<code>` returns the briefing for the requested language, falling back to the city's primary language. The `lang` param is validated against `city.languages`.

3. **Frontend** — Uses `useNewsSummary(cityId, i18n.language)` hook (refetch 15 min). Passes the user's selected language to the API. When the user switches language, React Query fetches the briefing in the new language.

### LLM Integration (`packages/server/src/lib/openai.ts`)

- **Client:** LangChain `ChatOpenAI` with Zod-validated structured output (`.withStructuredOutput(zodSchema, { includeRaw: true })`)
- **Model:** `gpt-5-mini` for summarization (configurable via `OPENAI_MODEL`), `gpt-5-nano` for filtering/geolocation (configurable via `OPENAI_FILTER_MODEL`)
- **Structured output schemas:** `BriefingSchema` (dynamic — one key per configured language, e.g. `{ briefings: { de: string, en: string, tr: string, ar: string } }`), `FilterResultSchema` (index, relevant_to_city, category, importance, locationLabel), `GeoResultSchema` (index, locationLabel)
- **System prompt:** Local news editor for [city], two short paragraphs (~120 words per language), focus on daily-life impact, write in all configured languages in one response
- **Location extraction:** Filter prompt pushes LLM for district/neighborhood-level specificity (not bare city names). Includes examples mapping organizations to known addresses (e.g. "Senat" -> "Rotes Rathaus, Mitte"). Post-processing discards labels that are just the bare city name or "city, country" format before geocoding.
- **Usage tracking:** In-memory per-city totals (input/output tokens, call count). Exposed via `getUsageStats()` on the health endpoint.
- **Cost estimate:** gpt-5-mini at $1.00/1M input, $4.00/1M output
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
}
```

## DB Schema

- `newsItems` table — cityId, hash (dedup key via unique index `news_city_hash_idx`), title, url, publishedAt, sourceName, sourceUrl, description, category, tier, lang, relevantToCity (bool), importance (real, 0–1), lat, lon, locationLabel, fetchedAt. UPSERT on (cityId, hash). 7-day retention. Reads limited to 500 rows.
- `aiSummaries` table — cityId, lang, headlineHash, summary, model, inputTokens, outputTokens, generatedAt. One row per language per generation batch (rows share the same generatedAt). INSERT-only. 30-day retention.

## Drop Logic

`applyDropLogic()` (exported from `ingest-feeds.ts`) filters out items the LLM assessed as irrelevant. Shared by the cron job, warm-cache, and the digest route. Drops all items where `relevant_to_city === false`. Items without assessment default to importance 0.5. Map markers require importance >= 0.5; summarization requires importance >= 0.3.
