# Plan: LLM-Based News Filtering & Geolocation

## Problem

The news digest contains too many irrelevant items — national/international news that happens to appear in city-focused RSS feeds. The existing keyword classifier only categorizes headlines (transit, crime, politics, etc.) but doesn't filter out items that aren't actually about the city. Additionally, news items and police reports have no map presence — users can't see where things are happening.

## Goals

1. Use the existing OpenAI integration to filter news items for city relevance during ingestion
2. Extract geographic coordinates for news items and police reports so they can appear as map pins
3. Keep costs low — batch headlines into a single LLM call rather than one per item

## Current Architecture

- **Ingestion**: `ingest-feeds.ts` fetches RSS, classifies via keyword regex, caches digest
- **Summarization**: `summarize.ts` already calls OpenAI gpt-5-mini with a city-focused prompt
- **OpenAI client**: `packages/server/src/lib/openai.ts` — wraps the official `openai` package
- **Model for filtering**: `gpt-5-nano` — cheapest model ($0.05/1M input, $0.40/1M output), sufficient for relevance classification + location extraction

## Design

### Phase 1: LLM Relevance Filtering

**New function in `packages/server/src/lib/openai.ts`**:
```typescript
interface FilteredItem {
  index: number;        // Original position in input array
  relevant: boolean;    // Is this about the city?
  confidence: number;   // 0.0 – 1.0
  lat?: number;         // Estimated latitude (if identifiable)
  lon?: number;         // Estimated longitude (if identifiable)
  locationLabel?: string; // Human-readable location (e.g., "Alexanderplatz, Mitte")
}

async function filterAndGeolocateNews(
  cityId: string,
  cityName: string,
  items: Array<{ title: string; description?: string; sourceName: string }>,
): Promise<FilteredItem[]>
```

**System prompt** (structured JSON output):
```
You are a local news editor for {cityName}. For each headline below, determine:
1. Is this news item specifically about {cityName} or its immediate region? (relevant: true/false)
2. How confident are you? (confidence: 0.0–1.0)
3. If the item mentions a specific location in {cityName}, provide approximate coordinates and a label.

National/international news should be marked relevant:false UNLESS it has a concrete local angle.
Respond ONLY with a JSON array matching the input indices.
```

**Integration point**: `packages/server/src/cron/ingest-feeds.ts`
- After RSS parsing + keyword classification, before caching
- Batch all items (up to ~50) into one LLM call
- Filter out items where `relevant === false` AND `confidence >= 0.7`
- Attach `location` to items that got coordinates
- Items from tier-1 sources with `confidence < 0.7` are kept (benefit of the doubt)

**Cost estimate** (gpt-5-nano at $0.05/1M input, $0.40/1M output): ~50 headlines × ~20 tokens each = ~1000 input tokens per call. At 6 calls/hour (every 10 min), that's ~6000 input tokens/hour. Monthly: ~4.3M input tokens ≈ $0.22 + ~2M output tokens ≈ $0.80 = **~$1/month**.

### Phase 2: Police Report Geolocation

**Same LLM function**, called separately for police reports in `ingest-safety.ts`:
- Police reports already have district info (Berlin) but no coordinates
- Feed report titles + descriptions to the same geolocation prompt
- Police reports are always city-relevant, so skip relevance filtering — only extract location
- Prompt variant:
```
You are a geocoder for {cityName}. For each police report, extract the most specific location mentioned and provide approximate coordinates. If no location is identifiable, return null for lat/lon.
```

### Phase 3: Map Markers for News & Police

**Extend `NewsItem` type** (`packages/web/src/lib/api.ts`):
```typescript
export interface NewsItem {
  // ... existing fields ...
  location?: { lat: number; lon: number; label?: string };
}
```

**Extend `SafetyReport` type**:
```typescript
export interface SafetyReport {
  // ... existing fields ...
  location?: { lat: number; lon: number; label?: string };
}
```

**New map layers in `CityMap.tsx`**:
- `news-markers` layer: blue circles with category-based icons
- `safety-markers` layer: red/orange circles for police reports
- Click handler shows popup with title, source, and link
- Layer visibility tied to the existing `DataLayerToggles` in the sidebar

**New entries in `useCommandCenter` Zustand store**:
- Add `'news'` and `'safety'` to the `activeLayers` type
- Default: news off, safety on (police reports are more location-meaningful)

## Schema Changes

**`packages/server/src/db/schema.ts`** — `safetyReports` table:
- Add columns: `lat real`, `lon real`, `locationLabel text`

**No DB change for news** — news items are ephemeral (cache-only, not persisted per-item)

## Files Changed

| File | Change |
|---|---|
| `packages/server/src/lib/openai.ts` | Add `filterAndGeolocateNews()` + `geolocateReports()` |
| `packages/server/src/cron/ingest-feeds.ts` | Call filter after parsing, attach locations, drop irrelevant |
| `packages/server/src/cron/ingest-safety.ts` | Call geolocation for police reports |
| `packages/server/src/db/schema.ts` | Add lat/lon/locationLabel to safetyReports |
| `packages/server/src/db/writes.ts` | Persist new safety fields |
| `packages/server/src/db/reads.ts` | Read new safety fields |
| `shared/types.ts` | Add location to NewsItem + SafetyReport |
| `packages/web/src/lib/api.ts` | Mirror location fields |
| `packages/web/src/components/map/CityMap.tsx` | Add news + safety marker layers |
| `packages/web/src/stores/useCommandCenter.ts` | Add news/safety layer toggles |
| `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Add news/safety toggle UI |

## Implementation Order

1. Add `filterAndGeolocateNews()` to openai.ts
2. Integrate into `ingest-feeds.ts` — filter + geolocate
3. Add `geolocateReports()` to openai.ts
4. Integrate into `ingest-safety.ts` — geolocate police reports
5. Update DB schema for safety locations + migration
6. Update shared types and API client types
7. Add map marker layers to CityMap.tsx
8. Wire up layer toggles in sidebar
9. Typecheck + test

## Decisions

- **Model**: `gpt-5-nano` (cheapest, sufficient for classification + location extraction)
- **Filtering threshold**: `confidence >= 0.7` to drop irrelevant items. Can tune up later.
- **Fallback when OpenAI is unavailable**: Fall back to showing all items (current behavior) — no silent stale data.
- **Geolocation**: LLM+Nominatim hybrid. LLM extracts location names from headlines/reports, then OpenStreetMap Nominatim resolves to precise coordinates. Added `packages/server/src/lib/nominatim.ts` with rate-limited geocoding (1 req/sec per Nominatim policy).
