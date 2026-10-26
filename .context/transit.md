# Transit System

## Architecture

Transit data flows from the VBB transport.rest API through a server-side cron job into PostgreSQL and the in-memory cache, then to the React frontend via a REST endpoint.

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-transit.ts`) — Runs every 15 minutes. Polls departures with disruption remarks from 12 interchange stations covering all Berlin U+S lines via `v6.vbb.transport.rest`. Extracts warning-type remarks with station name, location (lat/lon), and full detail text (`remark.text`). Only `type`, `summary` and `text` are read from each remark; validity fields the API may send on warnings (e.g. `validFrom`/`validUntil`) are not captured, so alerts carry no start/end time. Deduplicates by `summary:station` key, classifies type and severity from German keywords, and writes `TransitAlert[]` to cache + DB. Skips cache write if all stations fail.

2. **API** (`packages/server/src/routes/transit.ts`) — `GET /api/:city/transit` returns cached alerts or `[]`.

3. **Frontend** — Two display surfaces:
   - **TransitStrip** (`components/strips/TransitStrip.tsx`) — One row per alert: severity dot, line badges and the summary clamped to one line (6 rows collapsed, 12 when the tile is expanded). Each row is a `<button aria-expanded>` that expands in place to the full summary, the full `detail` text (skipped when it equals the summary) and the station ("Reported at", `panel.transit.station`); long words wrap (`wrap-anywhere`). Rows expand independently and start collapsed in both tile modes. There is no time-range field: any "bis …" validity only appears inside `detail`.
   - **CityMap** (`components/map/CityMap.tsx`) — Transit markers as severity-colored circles on the map at each alert's station location. Click popup shows the station as heading, then for each alert its line, translated type label and the full `detail` text.

### Key Types

```typescript
interface TransitAlert {
  id: string;           // FNV-1a hash of summary:station
  line: string;         // "U2", "S1", "Bus M29" (comma-joined when several lines share the remark)
  lines: string[];      // every line carrying this remark at this station
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

Alerts are deduped by `${summary}:${station}` — lines carrying the same remark at the same station merge into one alert (`lines[]`). The same remark seen at two different stations stays two alerts, which is why the expanded row names the station.

### Classification

- **Type**: German keywords → cancellation (`Ausfall`), planned-work (`Bauarbeit`, `Sperrung`), delay (`Verspätung`), disruption (default)
- **Severity**: cancellation/Sperrung/Störung → high, delay → medium, other → low

### DB Schema

Unified `snapshots` table, type `vbb-disruptions` — data JSONB stores the full `TransitAlert[]` array as a single snapshot per fetch. Persisted via `saveTransitAlerts()` in `writes.ts` on every ingestion run (if DB connected). Data retention: 7 days.

### Hamburg

Hamburg transit is not yet supported. The HVV transport.rest API (`v6.hvv.transport.rest`) is deprecated and offline as of March 2026. No free alternative has been identified.
