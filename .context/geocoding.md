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

## Callers

- `lib/openai.ts → filterAndLocateHeadlines()` — geocodes news items after LLM location extraction
- `lib/openai.ts → geolocateSafetyReports()` — geocodes police reports after LLM location extraction

Both call `geocode()` in a sequential loop (one item at a time), so the rate limiter naturally throttles the batch.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LOCATIONIQ_TOKEN` | No | Enables LocationIQ as fallback. Nominatim-only mode if not set. |
