# Fix Bootstrap Air Quality Cache Key Bug

The bootstrap endpoint requests the wrong cache key for air quality data, causing it to always return `null` on cache-warmed startup.

## Bug

There are two separate air quality data paths:
- **Basic AQ** (`${city.id}:air-quality`) — set by `ingest-weather.ts:179`, served by `routes/air-quality.ts:26`
- **AQ grid** (`${city.id}:air-quality:grid`) — set by `ingest-air-quality-grid.ts:233`, warmed by `warm-cache.ts:82`

The bootstrap endpoint at `routes/news.ts:105` requests `${city.id}:air-quality`. But `warm-cache.ts` only warms the grid key (`air-quality:grid`), not the basic one. So on a fresh server start (before `ingest-weather` runs), bootstrap always returns `null` for air quality even though grid data exists in the DB and gets warmed.

## Fix

### 1. `packages/server/src/db/warm-cache.ts` — Also warm basic air quality

Add a cache warm entry for `${cityId}:air-quality` alongside the existing grid warm. This ensures both keys are populated on startup.

### 2. `packages/server/src/routes/news.ts` — Verify bootstrap key matches what's actually useful

Check whether the frontend bootstrap consumer expects the basic AQ or the grid. If it expects the grid, change the bootstrap key to `air-quality:grid`. If both are needed, include both in the getBatch call.

### 3. Verify

- Confirm that the bootstrap response includes non-null air quality data when the cache is warm.
- Check frontend `useAirQuality` hook handles both bootstrap-provided and individually-fetched data correctly.

## Scope

- 1-2 files changed, a few lines each
- No migration, no new files
