# News & AI Summarization

## Feed Ingestion

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-feeds.ts`) — Runs every 10 minutes. Fetches RSS/Atom feeds from city-configured sources (10 feeds for Berlin across 3 tiers). Parses with `fast-xml-parser`, classifies headlines by German keywords, deduplicates by URL+title hash, sorts by tier then recency. Writes to cache keys `{cityId}:news:digest` and `{cityId}:news:{category}` (TTL 900s). Uses in-flight coalescing via `cache.fetch()` to avoid re-fetching the same feed within 10 min.

2. **API** (`packages/server/src/routes/news.ts`) — `GET /api/:city/news/digest` returns cached digest or empty structure.

3. **Frontend** (`packages/web/src/components/panels/NewsBriefingPanel.tsx`) — Uses `useNewsDigest()` hook (refetch 5 min). Renders articles by category/tier.

### Feed Configuration

Feeds are defined in city config files (e.g. `packages/server/src/config/cities/berlin.ts`). Each feed has:
- `name`, `url`, `tier` (1=primary, 2=secondary, 3=tertiary), `type` ('rss'|'atom'), `lang`, optional `category` override

Berlin has 10 feeds: rbb24, Tagesspiegel, Berliner Morgenpost, BZ Berlin, Berlin.de News, Berliner Zeitung, taz Berlin, RBB Polizei (category=crime), Grunderzene, Exberliner.

### Ingestion Constraints

- Per-feed timeout: 8s
- Overall deadline: 25s (stops fetching more feeds if exceeded)
- Batch concurrency: 10 feeds at once
- Raw feed XML cached separately (TTL 600s) to avoid redundant fetches

### Classifier (`packages/server/src/lib/classifier.ts`)

Keyword-based German headline classification into 8 categories: transit, crime, politics, culture, weather, economy, sports, local (fallback). High-confidence keywords (0.85) like Sperrung, Mord, Senat; medium-confidence (0.6) like Baustelle, Polizei. Short keywords use word boundaries to avoid false positives.

### RSS Parser (`packages/server/src/lib/rss-parser.ts`)

Supports RSS 2.0 and Atom formats. Returns normalized `FeedItem[]` with title, url, publishedAt, description, imageUrl.

## AI Summarization

### Data Flow

1. **Summarization** (`packages/server/src/cron/summarize.ts`) — Runs every 15 minutes (at :05, :20, :35, :50). Skipped if `OPENAI_API_KEY` not set. Takes top 10 headlines (tier <= 2) from cached news digest. Hashes the top 5 headlines to detect changes — skips API call if headlines unchanged since last summary. Writes to cache key `{cityId}:news:summary` (TTL 86400s / 24h) and persists to Postgres with token counts.

2. **API** (`packages/server/src/routes/news.ts`) — `GET /api/:city/news/summary` returns cached summary, falls back to Postgres, then empty structure.

3. **Frontend** — Uses `useNewsSummary()` hook (refetch 15 min). Displays briefing text with generation timestamp.

### OpenAI Integration (`packages/server/src/lib/openai.ts`)

- **Client:** Official `openai` npm package
- **Model:** `gpt-5-mini` (configurable via `OPENAI_MODEL` env var)
- **Reasoning:** `low` (fast, cheap)
- **System prompt:** Local news editor for [city], 2-3 sentence briefing, focus on daily-life impact, write in [language]
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
  category: string;     // From classifier or feed config override
  tier: number;         // 1 (primary) to 3 (tertiary)
  lang: string;
}

interface NewsDigest {
  items: NewsItem[];
  categories: Record<string, NewsItem[]>;
  updatedAt: string;
}

interface NewsSummary {
  briefing: string;
  generatedAt: string;
  headlineCount: number;
  cached: boolean;
}
```

## DB Schema

`aiSummaries` table — cityId, headlineHash, summary, model, inputTokens, outputTokens, generatedAt. No table for news items (feeds are ephemeral, re-fetched on every cron run).
