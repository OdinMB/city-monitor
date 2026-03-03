# Transit System

## Architecture

Transit data flows from the VBB transport.rest API through a server-side cron job into PostgreSQL and the in-memory cache, then to the React frontend via a REST endpoint.

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-transit.ts`) — Runs every 15 minutes. Polls departures with disruption remarks from 12 interchange stations covering all Berlin U+S lines via `v6.vbb.transport.rest`. Extracts warning-type remarks with station name, location (lat/lon), and full detail text (`remark.text`). Deduplicates by `line:summary` key, classifies type and severity from German keywords, and writes `TransitAlert[]` to cache + DB. Skips cache write if all stations fail.

2. **API** (`packages/server/src/routes/transit.ts`) — `GET /api/:city/transit` returns cached alerts or `[]`.

3. **Frontend** — Two display surfaces:
   - **TransitStrip** (`components/strips/TransitStrip.tsx`) — Compact alert cards with station name, summary, and expandable detail text on click. Severity-colored left border.
   - **CityMap** (`components/map/CityMap.tsx`) — Transit markers as severity-colored circles on the map at each alert's station location. Click popup shows line, type, station, and message.

### Key Types

```typescript
interface TransitAlert {
  id: string;           // FNV-1a hash of line:summary
  line: string;         // "U2", "S1", "Bus M29"
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

Stations are configured in `packages/server/src/config/cities/berlin.ts` as `transit.stations[]` with VBB station IDs.

### Deduplication

Alerts are deduped by `${line}:${summary}` — the same disruption reported across multiple stations is only shown once.

### Classification

- **Type**: German keywords → cancellation (`Ausfall`), planned-work (`Bauarbeit`, `Sperrung`), delay (`Verspätung`), disruption (default)
- **Severity**: cancellation/Sperrung/Störung → high, delay → medium, other → low

### DB Schema

`transitDisruptions` table — cityId, line, type, severity, message, detail, station, lat, lon, affectedStops (JSONB), resolved. Indexed by `transit_city_idx(cityId)`. Persisted via `saveTransitAlerts()` in `writes.ts` on every ingestion run (if DB connected). Data retention: resolved alerts older than 48 hours are pruned nightly.

### Hamburg

Hamburg transit is not yet supported. The HVV transport.rest API (`v6.hvv.transport.rest`) is deprecated and offline as of March 2026. No free alternative has been identified.
