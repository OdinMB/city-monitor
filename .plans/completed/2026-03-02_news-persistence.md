# News Item Persistence

## Problem

News items are only stored in the in-memory cache. On every server restart (or cache expiry), all ~440 items are re-fetched, re-classified, and re-analyzed through the LLM filter (`gpt-5-nano` + serial Nominatim geocoding). This is slow, wasteful, and costs real money per OpenAI call.

## Goal

Persist fetched news items in Postgres along with their LLM relevance assessments and geo data. On subsequent cron runs, only send *genuinely new* items through the expensive LLM filter. On server restart, warm the cache from DB so the digest is available immediately.

## Approach

Follow the established dual-write pattern (see `ingest-safety.ts` lines 72-90 for the identical "carry forward from DB" technique).

### 1. Schema — new `newsItems` table

**File:** `packages/server/src/db/schema.ts`

```
newsItems table:
  id          serial PK
  cityId      text NOT NULL
  hash        text NOT NULL          — FNV-1a(url+title), the dedup key
  title       text NOT NULL
  url         text NOT NULL
  publishedAt timestamp
  sourceName  text NOT NULL
  sourceUrl   text NOT NULL
  description text
  category    text NOT NULL
  tier        integer NOT NULL
  lang        text NOT NULL
  relevant    boolean               — LLM assessment (null = not assessed)
  confidence  real                  — LLM confidence 0.0–1.0
  lat         real                  — geocoded location
  lon         real                  — geocoded location
  locationLabel text                — raw location text from LLM
  fetchedAt   timestamp DEFAULT NOW()

  index: news_city_idx(cityId)
```

### 2. DB write — `saveNewsItems()`

**File:** `packages/server/src/db/writes.ts`

Full-replace pattern (delete + insert per city), same as all other tables. Write all current items for the city, including their assessments.

### 3. DB read — `loadNewsItems()`

**File:** `packages/server/src/db/reads.ts`

Load all items for a city. Return as `NewsItem[]` with an extra `assessment` field containing `{relevant, confidence}`. Used by both warm-cache and the ingestion job.

### 4. Ingestion flow change

**File:** `packages/server/src/cron/ingest-feeds.ts`

Change factory: `createFeedIngestion(cache)` → `createFeedIngestion(cache, db)` (matches all other cron jobs).

New flow in `ingestCityFeeds`:
1. Fetch + parse + keyword-classify (unchanged)
2. Deduplicate by hash (unchanged)
3. **Load existing assessments from DB** — build `Map<hash, {relevant, confidence, lat, lon, label}>`
4. **Partition** items into "known" (hash in DB) and "new" (hash not in DB)
5. For "known" items: carry forward the relevance/confidence/location from DB
6. For "new" items only: send through `applyLlmFilter()`
7. **Apply drop logic** to ALL items (same thresholds as today)
8. Build digest, write to cache (unchanged)
9. **Persist ALL items** (with assessments) to DB via `saveNewsItems()`

This means the LLM filter call shrinks from 440 items to just the delta (typically 0-20 new items per 10-minute cycle).

### 5. Cache warming

**File:** `packages/server/src/db/warm-cache.ts`

Add news item loading: read items from DB → build digest → populate `{cityId}:news:digest` cache key. This gives immediate data on server restart.

### 6. Data retention

**File:** `packages/server/src/cron/data-retention.ts`

Add `newsItems` pruning: delete items older than 7 days (matches safety reports retention).

### 7. App wiring

**File:** `packages/server/src/app.ts`

Pass `db` to `createFeedIngestion(cache, db)`.

### 8. News digest route — DB fallback

**File:** `packages/server/src/routes/news.ts`

Add DB fallback for the digest endpoint (currently cache-only). Follow the pattern from the summary endpoint.

## Files to modify

| File | Change |
|---|---|
| `packages/server/src/db/schema.ts` | Add `newsItems` table |
| `packages/server/src/db/writes.ts` | Add `saveNewsItems()` |
| `packages/server/src/db/reads.ts` | Add `loadNewsItems()` |
| `packages/server/src/cron/ingest-feeds.ts` | Accept `db`, load existing → filter delta only → persist |
| `packages/server/src/db/warm-cache.ts` | Load news items → build digest → set cache |
| `packages/server/src/cron/data-retention.ts` | Prune old news items |
| `packages/server/src/app.ts` | Pass `db` to feed ingestion |
| `packages/server/src/routes/news.ts` | Add DB fallback for digest |

## Files to create

| File | Purpose |
|---|---|
| `packages/server/src/cron/ingest-feeds.test.ts` | Tests for the new DB-aware ingestion flow |

## Out of scope

- Changing the LLM filter prompt or model
- Changing the feed list or keyword classifier
- The Hamburg keyword TODO (separate task)
- Historical analytics on news items
