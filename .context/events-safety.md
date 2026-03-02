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
- `safetyReports` table — cityId, title, description, publishedAt, url, district, hash. Indexed by `safety_city_published_idx(cityId, publishedAt)`. Persisted via `saveSafetyReports()`. Data retention: reports older than 7 days are pruned nightly.
