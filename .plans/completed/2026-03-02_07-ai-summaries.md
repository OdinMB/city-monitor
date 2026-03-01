# Milestone 07 — AI Summaries

**Goal:** Add GPT-5 powered news briefings — a 2-3 sentence summary of the city's top stories.

**Depends on:** [04-news-pipeline.md](04-news-pipeline.md) (needs news digest to summarize)

---

## Steps

### 1. OpenAI client (`packages/server/src/lib/openai.ts`)

**Reference files:**
- `.worldmonitor/server/worldmonitor/news/v1/summarize-article.ts` — summarization with temperature 0.3, max_tokens 100, 2-sentence constraint
- `.worldmonitor/server/worldmonitor/news/v1/_shared.ts` — provider resolution, cache key generation, token tracking, response post-processing (strip `<think>` tags, reject narration preambles)
- `.worldmonitor/server/_shared/hash.ts` — FNV-1a hash for deterministic cache keys

Use the official `openai` npm package instead of raw fetch:

```typescript
import OpenAI from 'openai';

const client = new OpenAI(); // reads OPENAI_API_KEY from env

// Token usage tracking (for cost monitoring)
const usage: Record<string, { input: number; output: number; calls: number }> = {};

export async function summarizeHeadlines(
  cityName: string,
  headlines: string[],
  lang: string,
): Promise<{ summary: string; cached: boolean }>
```

### 2. Summarization prompt

Adapt worldmonitor's prompt for city context:

```
System: You are a local news editor for {cityName}. Summarize the following headlines
into a 2-3 sentence briefing for residents. Focus on what affects daily life — transit,
weather, local politics, safety, cultural events. Be factual and concise.
Write in {language}.

User:
1. {headline 1}
2. {headline 2}
...
10. {headline 10}
```

Parameters (from worldmonitor, proven effective):
- `model`: `gpt-5` (or `gpt-4.1-mini` for cheaper testing)
- `temperature`: 0.3
- `max_tokens`: 150
- `top_p`: 0.9

### 3. Storage strategy

**Reference:** `.worldmonitor/server/worldmonitor/news/v1/summarize-article.ts`
- Cache key = FNV-1a hash of sorted top-5 headlines + mode + context
- TTL = 86400s (24h)

#### Schema addition (`packages/server/src/db/schema.ts`)

```typescript
export const aiSummaries = pgTable('ai_summaries', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  headlineHash: text('headline_hash').notNull(),  // FNV-1a of sorted top-5 headlines
  summary: text('summary').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});
```

Write to Postgres, then update memory cache: `{cityId}:news:summary` (TTL 86400s / 24h). On cache miss, the latest summary is loaded from Postgres. The `headline_hash` enables skipping regeneration when headlines haven't changed.

### 4. Summarization cron (`packages/server/src/cron/summarize.ts`)

Runs every 15 min (offset 5 min from feed ingestion):

```
For each active city:
  1. Read news digest from cache
  2. Take top 10 headlines (tier 1+2, most recent)
  3. Build cache key from sorted top-5 headlines
  4. Check Postgres for existing summary with same headline_hash → skip if found
  5. Call GPT-5 → get summary
  6. Write to Postgres (ai_summaries table)
  7. Update memory cache: `{cityId}:news:summary` (TTL 24h)
  8. Log token usage
```

### 5. Summary API endpoint

```typescript
GET /api/:city/news/summary → {
  briefing: string,           // "Berlin saw major BVG disruptions..."
  generatedAt: string,        // ISO timestamp
  headlineCount: number,
  cached: boolean,
}
```

### 6. NewsBriefingPanel update

Add the AI-generated summary at the top of the NewsBriefingPanel, above the headline list:

```tsx
<Panel title="News">
  {summary && (
    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm leading-relaxed">
      {summary.briefing}
    </div>
  )}
  <ul>{/* headlines */}</ul>
</Panel>
```

### 7. Cost monitoring

Track total tokens per city per day. Expose via health endpoint:

```typescript
GET /api/health → {
  ...
  ai: {
    berlin: { inputTokens: 14400, outputTokens: 14400, calls: 96, estimatedCostUsd: 0.18 }
  }
}
```

---

## Done when

- [ ] Summarization cron generates briefings every 15 min
- [ ] `GET /api/berlin/news/summary` returns a 2-3 sentence briefing
- [ ] Summaries are persisted in Postgres and cached for 24h (same headlines = same hash)
- [ ] Token usage is tracked and visible in the health endpoint
- [ ] NewsBriefingPanel shows the AI summary above the headline list
- [ ] Works without `OPENAI_API_KEY` (summary section just doesn't appear)
