# Geocoding

## Overview

`packages/server/src/lib/geocode.ts` resolves location names (e.g. "Alexanderplatz") to lat/lon coordinates. Used by the OpenAI LLM pipelines to place news items and safety reports on the map.

## Providers

### Nominatim (primary)

- **Endpoint:** `https://nominatim.openstreetmap.org/search`
- **Auth:** None (free, no API key)
- **Rate limit:** 1 req/s (enforced with 1100ms gap)
- **Usage policy:** Requires `User-Agent` header identifying the application
- **Docs:** https://nominatim.org/release-docs/latest/api/Search/

### LocationIQ (fallback)

- **Endpoint:** `https://us1.locationiq.com/v1/search`
- **Auth:** `LOCATIONIQ_TOKEN` env var (required to enable)
- **Rate limit:** Free tier 5,000 req/day, 2 QPS (enforced with 500ms gap)
- **Docs:** https://locationiq.com/docs
- **Nominatim-compatible** — same query params and response format

## Fallback Strategy

```
1. Nominatim slot available?  → use Nominatim
2. Nominatim busy + LOCATIONIQ_TOKEN set?  → use LocationIQ
3. LocationIQ fails or no token?  → wait for Nominatim slot
```

The check is **non-blocking**: if Nominatim's 1.1s gap hasn't elapsed, LocationIQ handles the request immediately instead of waiting. This maximizes throughput during batch geocoding (news filter + safety geolocate run sequentially over multiple items).

## API

```typescript
import { geocode } from './geocode.js';

const result = await geocode('Alexanderplatz', 'Berlin');
// { lat: 52.5219, lon: 13.4132, displayName: 'Alexanderplatz, Mitte, Berlin' }
// or null if not found / all providers failed
```

- **`location`** — place name (street, landmark, district)
- **`cityName`** — appended to query for disambiguation (e.g. "Alexanderplatz, Berlin")
- **Returns** `GeocodeResult | null` — coordinates + display name, or null on failure
- All queries scoped to `countrycodes=de` (Germany only)

## Caching

Three layers prevent redundant geocoding calls:

### Layer 1: In-process Map (`geocode.ts`)

Module-level `Map<string, GeocodeResult | null>` keyed by lowercase query string. Location names are stable landmarks — cached indefinitely within a process lifetime. Legitimate "not found" results (empty API response) are cached as `null`; transient network errors are **not** cached so they can be retried.

```typescript
import { clearGeocodeCache } from './geocode.js';
clearGeocodeCache(); // reset in tests
```

### Layer 2: Postgres `geocode_lookups` table

Persistent lookup table that survives server restarts. Schema:

```
geocode_lookups
├── id: serial PK
├── query: text NOT NULL UNIQUE  ← lowercase "alexanderplatz, berlin"
├── lat: real NOT NULL
├── lon: real NOT NULL
├── displayName: text NOT NULL
├── provider: text NOT NULL      ← "nominatim" | "locationiq"
└── createdAt: timestamp DEFAULT now()
```

Only successful results (lat/lon found) are stored. Failed lookups (`null`) stay in Layer 1 only — they can be retried after a restart in case data has been added to Nominatim.

**Initialization:** `initGeocodeDb(db)` is called once at startup in `app.ts`, storing a module-level DB reference. The `geocode()` function signature is unchanged.

**Cache warming:** On startup, `warm-cache.ts` loads all rows and populates the in-process Map before any cron jobs run.

**Lookup order:** Map (~0ms) → DB (~5ms) → External API (~500–1100ms). On hit at any layer, all faster layers above are populated.

### Layer 3: Safety-cron coordinate reuse (`ingest-safety.ts`)

Before calling the LLM+geocoder pipeline, the safety cron loads existing reports from Postgres and carries over stored `lat`/`lon`/`label` for items whose hash already exists with coordinates. This avoids redundant **LLM** calls (a different concern than geocoding persistence).

## Callers

- `lib/openai.ts → filterAndGeolocateNews()` — geocodes news items after LLM location extraction
- `lib/openai.ts → geolocateReports()` — geocodes police reports after LLM location extraction

Both call `geocode()` in a sequential loop (one item at a time), so the rate limiter naturally throttles the batch.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LOCATIONIQ_TOKEN` | No | Enables LocationIQ as fallback. Nominatim-only mode if not set. |
