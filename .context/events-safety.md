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

## NINA Civil-Protection Warnings

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-nina.ts`) — Runs every 5 minutes for each German city with `dataSources.nina` (its regional key `ars`). Fetches `https://warnung.bund.de/api31/dashboard/{ars}.json`, drops DWD weather warnings (the weather tile has those), and fetches each remaining warning's CAP detail (description, instruction, urgency, expiry) and GeoJSON area, both optional. Sorts by severity, then newest start, and writes `NinaWarning[]` to cache key `{cityId}:nina:warnings` (TTL 600s) and one `bbk-nina` snapshot row.

2. **API** (`packages/server/src/routes/nina.ts`) — `GET /api/:city/nina` returns the cached list, falls back to the newest `bbk-nina` row (`loadNinaWarnings`, refused once over 3 h old), then `[]`. Non-German cities always get `[]`. The bootstrap's `nina` slot is the same cache entry.

3. **Frontend** — `NinaBanner` above the dashboard and the map's warning areas ([frontend.md](frontend.md)).

### Ended warnings, and found nothing vs. failed

- **An ended warning is never served.** `hasEnded()` counts a warning as over once it is withdrawn (CAP `msgType` `Cancel`, in the entry's `type`, its `payload.data.msgType` or the detail) or its `expiresAt` has passed. The expiry is the dashboard entry's `expiresDate`, or else the detail's `info[0].expires`. Ingestion leaves ended warnings out, and the route and the bootstrap pass every answer through `currentWarnings()`, because a cached or stored list outlives its warnings. A warning with no expiry stays until NINA stops listing it. An all-clear sent as a Cancel message is not shown at all.
- **Found nothing replaces the last list.** A successful request stores its list even when it is empty, so the newest `bbk-nina` row is always what the last successful run found, and a restart, a cache expiry or cache warming cannot bring back a cleared warning. The freshness check then also sees these rows, so a restart within 5 minutes of a successful run skips the startup fetch.
- **A failed request keeps the last list.** A non-OK status, a network error, or a body that is not a JSON list stores nothing and leaves the cache as it was, so a NINA outage does not read as "no warnings". The last list is served, minus the warnings that have ended since, until its row is over 3 h old; then the banner is empty.
- **Weather and transit.** Weather follows the same rule for its forecast only: a successful run stores the whole snapshot, `alerts: []` included, and a failed forecast request stores nothing. Its DWD alerts are not covered: a failed alerts request within a successful run is stored as no alerts (`fetchDwdAlerts` returns `[]` on a non-OK response, and a thrown error leaves the forecast's empty `alerts`, which `saveWeather` writes). Transit agrees on failure (all stations failed: nothing written) but not on found-nothing: `saveTransitAlerts` skips an empty list, so its database keeps the last non-empty one.

## DB Schema

- `events` table — cityId, title, venue, date, endDate, category, url, description, free, hash, source, price. Indexed by `events_city_date_idx(cityId, date)` and `events_city_source_idx(cityId, source, date)`, unique on (cityId, hash). Persisted via `saveEvents()` (UPSERT) per source on every ingestion run. Data retention: rows not refreshed (`fetchedAt`) for 3 days are pruned nightly.
- `safetyReports` table — cityId, title, description, publishedAt, url, district, lat, lon, locationLabel, geoAttempted, hash. Indexed by `safety_city_published_idx(cityId, publishedAt)`, unique on (cityId, hash). Persisted via `saveSafetyReports(db, cityId, reports, geoAttempted)` (UPSERT). Data retention: rows not refreshed (`fetchedAt`) for 3 days are pruned nightly.
