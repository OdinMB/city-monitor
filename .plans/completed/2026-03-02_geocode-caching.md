# Geocode Caching — Stop Repeated Network Calls

## Problem

Every 10-minute cron run (feeds + safety × 2 cities) re-geocodes all items from scratch. `geocode()` has zero caching — every call hits Nominatim/LocationIQ and logs a `FETCH` line. With ~30 items/run × 2 cities × 2 jobs × 6 runs/hour, that's 700+ log lines/hour of pure repetition.

Compounding factors:
- **Safety cron:** does delete-all + re-insert in DB, so previously stored coordinates are discarded and re-fetched next run.
- **Feed cron:** no DB persistence at all — rebuilds everything from scratch every 10 min.
- **Server restarts:** in-process state lost frequently (Render free tier spins down).

## Solution — Two Layers of Geocode Caching

### Layer 1: In-process `Map` cache in `geocode.ts`

Add a `Map<string, GeocodeResult | null>` that prevents repeat network calls within a single server process lifetime. Location names are stable landmarks — indefinite in-process cache is appropriate.

**Files:** `packages/server/src/lib/geocode.ts`, `packages/server/src/lib/geocode.test.ts`

Changes:
- Add `geocodeCache: Map<string, GeocodeResult | null>` at module level
- Check cache before hitting any provider
- Store result (including null for negative caching) after provider call
- Export a `clearGeocodeCache()` for testing

### Layer 2: Skip re-geocoding items already stored with coordinates

**Safety cron** (`ingest-safety.ts`):
- Before calling `geolocateReports()`, load existing reports from DB (via `loadSafetyReports`)
- Build a `Map<hash, {lat, lon, label}>` of already-geocoded items
- Only send items to the LLM+geocoder pipeline if their hash isn't already in the map with coordinates
- Carry over stored coordinates for existing items

**Feed cron** (`ingest-feeds.ts`):
- Benefits from Layer 1 automatically (same location strings won't hit the network twice per process lifetime)
- No DB persistence needed — feeds are ephemeral cache-only data, and in-process geocode cache covers the repeat case

### Testing

- `geocode.test.ts`: Add tests for cache hit (no second fetch), negative caching (null stored), and `clearGeocodeCache()`
- `ingest-safety.test.ts`: Add test verifying that items with existing DB coordinates skip the geocoder

## Files to Modify

1. `packages/server/src/lib/geocode.ts` — add in-process Map cache
2. `packages/server/src/lib/geocode.test.ts` — add cache behavior tests
3. `packages/server/src/cron/ingest-safety.ts` — load existing coords from DB before geocoding
4. `packages/server/src/cron/ingest-safety.test.ts` — test coordinate reuse from DB
5. `.context/geocoding.md` — document the caching layers
