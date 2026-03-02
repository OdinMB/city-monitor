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

Currently hardcoded to Berlin districts (Mitte, Kreuzberg, etc.). When adding a second city, move district lists into city config or add per-city district detection.

## Events

### Current State

Events infrastructure is in place but **ingestion is a placeholder** — no Berlin events source is configured yet. The `dataSources.events` field in city config controls whether ingestion runs.

### Key Types

```typescript
interface CityEvent {
  id: string;
  title: string;
  venue?: string;
  date: string;
  category: 'music' | 'art' | 'theater' | 'food' | 'market' | 'sport' | 'community' | 'other';
  url: string;
  description?: string;
  free?: boolean;
}
```

### To Activate

1. Find a suitable Berlin events RSS/API source
2. Add `events: { provider: 'rss', url: '...' }` to `packages/server/src/config/cities/berlin.ts`
3. Implement `ingestCityEvents()` in `packages/server/src/cron/ingest-events.ts`

## DB Schema

`events` and `safetyReports` tables are defined in `schema.ts` but not yet wired to runtime — cache-only for now (same pattern as weather, transit, AI summaries).
