# Transit System

## Architecture

Transit data flows from the VBB transport.rest API through a server-side cron job into PostgreSQL and the in-memory cache, then to the React frontend via a REST endpoint.

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-transit.ts`) — Runs every 15 minutes. Polls departures with disruption remarks from 12 interchange stations covering all Berlin U+S lines via `v6.vbb.transport.rest`. Stations are polled one after another, 1.5 s apart. Extracts warning-type remarks with station name, location (lat/lon), and full detail text (`remark.text`). Groups by `summary:station` key (see Deduplication), classifies type and severity from keywords, and writes `TransitAlert[]` to cache (`{cityId}:transit:alerts`, TTL 1200s) + DB. Skips cache write if all stations fail.

2. **API** (`packages/server/src/routes/transit.ts`) — `GET /api/:city/transit` returns cached alerts, falls back to the DB (`loadTransitAlerts`), then `[]`.

3. **Frontend** — Two display surfaces:
   - **TransitStrip** (`components/strips/TransitStrip.tsx`) — Compact alert cards with station name, summary, and expandable detail text on click. Severity-colored left border.
   - **CityMap** (`components/map/layers/transit.ts`) — Transit markers as severity-colored TrainFront badge icons, with the line label, at each alert's station location. Click popup shows line, type, station, and message.

### Key Types

```typescript
interface TransitAlert {
  id: string;           // hashString(`${summary}:${station}`)
  line: string;         // all affected lines joined, e.g. "S41, S42"
  lines: string[];      // ["S41", "S42"]
  type: 'delay' | 'disruption' | 'cancellation' | 'planned-work';
  severity: 'low' | 'medium' | 'high';
  message: string;      // remark.summary (short)
  detail: string;       // remark.text (full description with station/elevator specifics)
  station: string;      // departure.stop.name (e.g. "S+U Alexanderplatz Bhf (Berlin)")
  location: { lat: number; lon: number } | null;  // departure.stop.location
  affectedStops: string[];
}
```

### Station Coverage (Berlin)

12 interchange stations covering all U1–U9 + S1–S85 lines:
Alexanderplatz, Hauptbahnhof, Zoologischer Garten, Friedrichstraße, Gesundbrunnen, Ostkreuz, Südkreuz, Westkreuz, Nollendorfplatz, Mehringdamm, Hermannplatz, Spandau.

Stations are configured in `packages/server/src/config/cities/berlin.ts` as `dataSources.transit.stations[]` with VBB station IDs (and `endpoint`, default `https://v6.vbb.transport.rest`).

### Deduplication

Alerts are keyed by `${summary}:${station}`. The same remark at the same station on several lines becomes one alert whose `lines` lists each line (and `line` joins them). The same remark at two different stations stays two alerts.

### Classification

Case-insensitive keyword match on the remark summary (German, with English equivalents):

- **Type**: cancellation (`ausfall`, `cancel`), planned-work (`bauarbeit`, `planned`, `sperrung`), delay (`verspätung`, `delay`), disruption (default)
- **Severity**: high (`ausfall`, `cancel`, `sperrung`, `störung`, `disruption`), medium (`verspätung`, `delay`), low (other)

### DB Schema

Unified `snapshots` table, type `vbb-disruptions` — data JSONB stores the full `TransitAlert[]` array as a single snapshot per fetch. Persisted via `saveTransitAlerts()` in `writes.ts` on every ingestion run (if DB connected). Data retention: 2 days plus the 100-row cap (`CAPPED_RETENTION` in `cron/data-retention.ts`).

### Hamburg

Hamburg transit is not yet supported. The HVV transport.rest API (`v6.hvv.transport.rest`) is deprecated and offline as of March 2026. No free alternative has been identified.
