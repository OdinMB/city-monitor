# Events & Safety System

## Safety Reports

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-safety.ts`) — Runs every 10 minutes. Fetches berlin.de police RSS feed using the shared `parseFeed()` RSS parser. Extracts `SafetyReport[]` with district detection (hardcoded Berlin district list), writes to cache key `{cityId}:safety:recent` (TTL 900s).

2. **API** (`packages/server/src/routes/safety.ts`) — `GET /api/:city/safety` returns cached reports or `[]`.

3. **Frontend** (`packages/web/src/components/panels/SafetyPanel.tsx`) — Displays reports with district tags and relative time ("2h ago"). Links to full police report.

### Key Types

```typescript
interface SafetyReport {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  district?: string;  // Extracted from title (Berlin districts)
}
```

### District Extraction

Currently hardcoded to Berlin districts (Mitte, Kreuzberg, etc.). Hamburg uses presseportal.de RSS (no district extraction yet).

### Location Extraction

Map pins come from two steps: `geolocateReports()` (`lib/openai.ts`, model `OPENAI_GEO_MODEL`, falling back to `OPENAI_FILTER_MODEL`) asks the LLM for a location label per report, then `geocode()` turns the label into coordinates. Coordinates carry over by hash via `loadSafetyGeoState()`, so a placed report is never re-sent. `safety_reports.geo_attempted` stops the other re-send: once a *successful* LLM pass leaves a report without coordinates (no label, left out, or label did not geocode), it is marked and skipped on every later run. A failed call, or a response rejected by `checkBatchIndices`, marks nothing, so those reports are retried. The marker lives only in the DB row — it is not part of `SafetyReport` and never reaches the cache or API. Cache-only mode (no `DATABASE_URL`) still re-sends every unplaced report each run.

### Data Sources

- **Berlin:** `https://www.berlin.de/polizei/polizeimeldungen/index.php/rss`
- **Hamburg:** `https://www.presseportal.de/rss/dienststelle_6013.rss2`

Source URL configured per city in `dataSources.police.url`.

## Events

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-events.ts`) — Runs every 6 hours. Fetches upcoming events (next 7 days) from the kulturdaten.berlin API (Technologiestiftung Berlin). Filters to published events, classifies categories from German keywords in the title, writes `CityEvent[]` to cache key `{cityId}:events:upcoming` (TTL 6h).

2. **API** (`packages/server/src/routes/events.ts`) — `GET /api/:city/events` returns cached events or `[]`.

3. **Frontend** (`packages/web/src/components/panels/EventsPanel.tsx`) — Displays events with category icons, venue, date, and "Free" badges.

### Data Source

**kulturdaten.berlin API** (free, no API key required):
- Endpoint: `https://api-v2.kulturdaten.berlin/api/events`
- Provides ~13,000+ events from Berlin district calendars (Bezirkskalender)
- JSON response with attractions (title), locations (venue), schedule, admission info
- Swagger docs: `https://api-v2.kulturdaten.berlin/api/docs/`

### Key Types

```typescript
interface CityEvent {
  id: string;           // kulturdaten.berlin identifier (e.g. "E_ABC123")
  title: string;        // From attractions[0].referenceLabel.de
  venue?: string;       // From locations[0].referenceLabel.de
  date: string;         // ISO date+time from schedule
  category: 'music' | 'art' | 'theater' | 'food' | 'market' | 'sport' | 'community' | 'other';
  url: string;          // Link to kulturdaten.berlin event page
  free?: boolean;       // From admission.ticketType === 'ticketType.freeOfCharge'
}
```

### Category Classification

German keywords in event title determine category: Konzert/Musik -> music, Ausstellung/Galerie -> art, Theater/Bühne -> theater, Markt/Flohmarkt -> market, Food/Essen -> food, Sport/Lauf -> sport, Workshop/Treff -> community, default -> other.

## DB Schema

- `events` table — cityId, title, venue, date, category, url, free, hash. Indexed by `events_city_date_idx(cityId, date)`. Persisted via `saveEvents()` on every ingestion run.
- `safetyReports` table — cityId, title, description, publishedAt, url, district, lat, lon, locationLabel, geoAttempted, hash. Indexed by `safety_city_published_idx(cityId, publishedAt)`, unique on (cityId, hash). Persisted via `saveSafetyReports(db, cityId, reports, geoAttempted)` (UPSERT). Data retention: rows not refreshed (`fetchedAt`) for 3 days are pruned nightly.
