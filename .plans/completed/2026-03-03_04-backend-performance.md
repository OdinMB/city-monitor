# Backend Performance

Address the highest-impact server-side performance issues: N+1 geocoding, missing compression, cache tuning, query optimization, and missing indices.

## Changes

### 1. Batch geocoding — `packages/server/src/lib/openai.ts`, `packages/server/src/lib/geocode.ts`

**Problem:** Geocoding is called sequentially in a loop (`await geocode()` per item). With Nominatim's 1 req/sec limit, 20 items = 20 seconds blocking.

**Fix:**
- Collect all locations that need geocoding into an array first
- Process them with `Promise.all` using a concurrency-limited helper (e.g., `p-limit` or the existing rate-gate) to respect Nominatim's rate limit but parallelize where the LocationIQ fallback allows it
- Alternatively, batch all geocode lookups through the existing DB lookup cache first — items already geocoded skip the API entirely

The key improvement is checking the DB cache for all items in a single query (`WHERE query IN (...)`) before making any API calls, rather than checking one at a time.

### 2. Response compression — `packages/server/src/app.ts`

Add `compression` middleware for gzip/brotli on all JSON responses. Bootstrap payloads can be 100-150KB uncompressed; compression typically achieves 80-90% reduction on JSON.

```
npm install compression @types/compression  (in packages/server)
```

### 3. Connection pool configuration — `packages/server/src/db/index.ts`

Explicitly configure the postgres connection pool:
- `max: 10` (Render starter DB allows 20 connections; leave headroom)
- `idle_timeout: 30` (seconds)
- `connect_timeout: 10` (seconds)

### 4. Cache TTL alignment — `packages/server/src/db/warm-cache.ts`

Add a 20% buffer to cache TTLs so they don't expire at the exact moment the cron fires:
- Events: 21600s → 25920s (6h → 7.2h)
- Traffic: 300s → 360s (5m → 6m)
- Appointments: 21600s → 25920s

This eliminates the race condition where a request hits an expired cache entry just as the cron is running.

### 5. News query optimization — `packages/server/src/db/reads.ts`

`loadNewsItems()` currently loads 500 rows then filters in JavaScript. Push the filtering logic (drop duplicates, category limits) into the SQL query using window functions or subqueries to reduce data transfer.

### 6. Missing database indices — `packages/server/src/db/schema.ts`

Add compound indices for the most common query patterns:
- `newsItems`: `(cityId, publishedAt DESC)` — used in loadNewsItems
- `safetyReports`: `(cityId, fetchedAt DESC)` — used in loadSafetyReports
- `aiSummaries`: `(cityId, generatedAt DESC)` — used in loadSummary

Generate and apply a migration for the new indices.

## Decisions

- **Batch geocode:** Add `p-limit` as a dependency for concurrency control. More ergonomic API than rolling our own.
- **News query:** Push the `relevant_to_city` filter into the SQL WHERE clause. It's a simple boolean check that currently loads 500 rows into JS just to discard some. Trivial to move to SQL: `WHERE relevant_to_city IS NULL OR relevant_to_city = true`.

## Testing

- Unit test: batch geocode resolves all items and respects rate limits
- Unit test: compression middleware active on JSON responses
- Performance: verify news query with EXPLAIN ANALYZE before/after index addition

## Scope

- 1 new dependency (compression)
- 5-6 files modified
- 1 migration (new indices)
