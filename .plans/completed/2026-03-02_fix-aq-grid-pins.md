# Fix: Air Quality Grid Pins Not Showing

## Problem

AQ grid pins don't appear on the map because:
1. The `/air-quality/grid` route has no on-demand fetch fallback — returns `[]` on cache miss
2. No DB persistence — AQ grid data is lost on server restart
3. No warm-cache entry — cache stays empty until first successful cron cycle
4. Minor: stale layer cleanup list in `updateAqGridLayer`
5. Minor: unstable `[]` reference triggers unnecessary useEffect runs

## Changes

### 1. DB schema — add `air_quality_grid` table
**File:** `packages/server/src/db/schema.ts`

Add a new table following the existing pattern (delete-all + re-insert per city):
```
air_quality_grid: id, city_id, lat, lon, european_aqi, station, url, fetched_at
```
Index on `city_id`.

### 2. DB writes — add `saveAirQualityGrid`
**File:** `packages/server/src/db/writes.ts`

Transaction: delete by city_id, insert all points. Same pattern as `saveTransitAlerts`.

### 3. DB reads — add `loadAirQualityGrid`
**File:** `packages/server/src/db/reads.ts`

Load rows, map to `AirQualityGridPoint[]`. Return `null` on empty.

### 4. Ingestion — accept `db` param and persist
**File:** `packages/server/src/cron/ingest-air-quality-grid.ts`

- Change `createAirQualityGridIngestion(cache)` → `createAirQualityGridIngestion(cache, db: Db | null = null)`
- Pass `db` through to `ingestCityAirQualityGrid`
- After cache.set, call `saveAirQualityGrid(db, city.id, grid)` if db is available
- Export `ingestCityAirQualityGrid` for on-demand use by the route

### 5. Route — add on-demand fallback
**File:** `packages/server/src/routes/air-quality.ts`

- Accept `db` in constructor: `createAirQualityRouter(cache, db)`
- On cache miss, call `ingestCityAirQualityGrid(city, cache, db)` then re-read cache
- Same pattern as the existing `/air-quality` endpoint

### 6. Warm cache — load AQ grid from DB
**File:** `packages/server/src/db/warm-cache.ts`

Add `loadAirQualityGrid` block for each city, same pattern as transit/safety.

### 7. Data retention — prune old AQ grid rows
**File:** `packages/server/src/cron/data-retention.ts`

Delete `air_quality_grid` rows older than 2 days (data refreshes every 30 min).

### 8. App wiring
**File:** `packages/server/src/app.ts`

Pass `db` to `createAirQualityGridIngestion(cache, db)` and `createAirQualityRouter(cache, db)`.

### 9. Frontend fix — stale layer cleanup
**File:** `packages/web/src/components/map/CityMap.tsx`

Remove `'aq-label'` and `'aq-circle'` from the cleanup list (dead references).

### 10. Frontend fix — stabilize empty array
**File:** `packages/web/src/components/map/CityMap.tsx`

Use a module-level `const EMPTY_AQ: AirQualityGridPoint[] = []` to avoid new `[]` on every render.

### 11. Tests
- `writes.test.ts` — add `saveAirQualityGrid` test
- `reads.test.ts` — add `loadAirQualityGrid` test
- `warm-cache.test.ts` — update mock and assertion
- `ingest-air-quality-grid.test.ts` — update for `db` param
