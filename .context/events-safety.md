# Events & Safety System

## Safety Reports

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-safety.ts`) — Runs every 10 minutes. Fetches each city's police RSS feed (`dataSources.police.url`) using the shared `parseFeed()` RSS parser. Extracts `SafetyReport[]` with district detection (the city's `dataSources.police.districts` list), writes to cache key `{cityId}:safety:recent` (TTL 900s).

2. **API** (`packages/server/src/routes/safety.ts`) — `GET /api/:city/safety` returns cached reports or `[]`.

3. **Frontend** — There is no police-report tile. `useSafety()` (refetch 10 min) feeds the map: with the news layer's `police` sub-layer on, `CityMap.tsx` passes the reports to `updateSafetyMarkers()` in `packages/web/src/components/map/layers/news-safety.ts`, which pins reports that have coordinates; the popup (`safetyPopupHtml`) shows title, district, the AI-estimated place and a link to the full report. Separately, Berlin's police press releases are also a news feed (`Polizei Berlin`, feed `category: 'crime'`), so they appear in the news strip, normally under the Crime tab. The feed category is only the starting value: the LLM classifier's category replaces it (`ingest-feeds.ts`).

### Key Types

```typescript
interface SafetyReport {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  district?: string;  // First entry of the city's district list found in the title
  location?: { lat: number; lon: number; label?: string };  // LLM label + geocoding, see below
}
```

### District Extraction

`extractDistrict()` returns the first name from the city's `dataSources.police.districts` that appears in the report title. Berlin lists its districts and larger neighbourhoods (Mitte, Kreuzberg, …); Hamburg lists its Bezirke and Stadtteile, longer compound names before the shorter names they contain (e.g. `Altona-Altstadt` before `Altona`). A city without a list gets no district.

### Location Extraction

Map pins come from two steps: `geolocateReports()` (`lib/openai.ts`, model `OPENAI_GEO_MODEL`, falling back to `OPENAI_FILTER_MODEL`) asks the LLM for a location label per report, then `geocode()` turns the label into coordinates. Coordinates carry over by hash via `loadSafetyGeoState()`, so a placed report is never re-sent. `safety_reports.geo_attempted` stops the other re-send: once a *successful* LLM pass leaves a report without coordinates (no label, left out, or label did not geocode), it is marked and skipped on every later run. A failed call, or a response rejected by `checkBatchIndices`, marks nothing, so those reports are retried. The marker lives only in the DB row — it is not part of `SafetyReport` and never reaches the cache or API. Cache-only mode (no `DATABASE_URL`) still re-sends every unplaced report each run.

### Data Sources

- **Berlin:** `https://www.berlin.de/presse/pressemitteilungen/index/feed?institutions[]=Polizei+Berlin`
- **Hamburg:** `https://www.presseportal.de/rss/dienststelle_6013.rss2`

Source URL configured per city in `dataSources.police.url`.

## Events

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-events.ts`) — Runs every 6 hours. For each city with `dataSources.events` (Berlin only), fetches every configured source in turn (kulturdaten.berlin, Ticketmaster, go~mus), keeps future events, and saves each source's events to the DB (`saveEvents`). Then merges all sources, sorts by date, caps at 200 (`MAX_FUTURE_EVENTS`) and writes `CityEvent[]` to cache key `{cityId}:events:upcoming` (TTL 6h); an empty merge leaves the cache as it was. A failing source is logged and skipped.

2. **API** (`packages/server/src/routes/events.ts`) — `GET /api/:city/events` returns cached events, falls back to the DB (`loadEvents`), then `[]`. Past events are filtered out on every read.

3. **Frontend** (`packages/web/src/components/strips/EventsStrip.tsx`) — `useEvents()` (refetch 30 min). Source filter (All / Community / Tickets / Museums), shown when at least two sources have events; category filter pills for categories present; up to 25 events (`MAX_VISIBLE`). Each row shows category icon, title, day and time, and a "Free" badge; rows with detail expand to venue, description, end date, price and a link.

### Data Sources

Configured per city as `EventSourceConfig[]` (`source`, `url`, optional `lookaheadDays`).

- **kulturdaten.berlin API** (Technologiestiftung Berlin; free, no API key): `https://api-v2.kulturdaten.berlin/api/events`. Events from Berlin district calendars (Bezirkskalender) for the next `lookaheadDays` (default 14), up to 3 pages of 50, published events only. Swagger docs: `https://api-v2.kulturdaten.berlin/api/docs/`
- **Ticketmaster Discovery API**: `https://app.ticketmaster.com/discovery/v2/events.json`, queried by city name and country, 100 events. Skipped without `TICKETMASTER_CONSUMER_KEY` (see `deployment.md`).
- **go~mus** (Berlin state museums): `https://smb.gomus.de/api/v4/events`, bookable events; the date is the first upcoming booking time.

### Key Types

```typescript
interface CityEvent {
  id: string;           // source id (go~mus ids are prefixed "gomus-")
  title: string;
  venue?: string;
  date: string;         // ISO date+time
  endDate?: string;
  category: 'music' | 'art' | 'theater' | 'food' | 'market' | 'sport' | 'community' | 'museum' | 'other';
  url: string;          // empty for kulturdaten and go~mus
  description?: string; // go~mus only (HTML stripped, 500 chars)
  free?: boolean;
  source: 'kulturdaten' | 'ticketmaster' | 'gomus';
  price?: string;       // Ticketmaster price range
}
```

### Category Classification

- **kulturdaten:** keywords in the title (German and English): Konzert/Musik -> music, Ausstellung/Galerie -> art, Theater/Bühne -> theater, Markt/Flohmarkt -> market, Food/Essen -> food, Sport/Lauf -> sport, Workshop/Treff -> community, Museum -> museum, default -> other.
- **Ticketmaster:** the segment name: Music -> music, Sports -> sport, Arts & Theatre -> theater, default -> other.
- **go~mus:** Bühne/Musik/Film/Konzert -> music, Workshop/Kurs/Führung -> community, default -> museum.

## DB Schema

- `events` table — cityId, title, venue, date, endDate, category, url, description, free, hash, source, price. Indexed by `events_city_date_idx(cityId, date)` and `events_city_source_idx(cityId, source, date)`, unique on (cityId, hash). Persisted via `saveEvents()` (UPSERT) per source on every ingestion run. Data retention: rows not refreshed (`fetchedAt`) for 3 days are pruned nightly.
- `safetyReports` table — cityId, title, description, publishedAt, url, district, lat, lon, locationLabel, geoAttempted, hash. Indexed by `safety_city_published_idx(cityId, publishedAt)`, unique on (cityId, hash). Persisted via `saveSafetyReports(db, cityId, reports, geoAttempted)` (UPSERT). Data retention: rows not refreshed (`fetchedAt`) for 3 days are pruned nightly.
