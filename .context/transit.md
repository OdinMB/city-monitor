# Transit System

## Architecture

Transit data flows from the VBB transport.rest API through a server-side cron job into the in-memory cache, then to the React frontend via a REST endpoint.

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-transit.ts`) — Runs every 5 minutes. Polls departures with disruption remarks from major Berlin stations via `v6.vbb.transport.rest`. Extracts warning-type remarks, deduplicates by `line:summary` key, classifies type and severity from German keywords, and writes `TransitAlert[]` to cache key `{cityId}:transit:alerts` (TTL 300s). Skips cache write if all stations fail.

2. **API** (`packages/server/src/routes/transit.ts`) — `GET /api/:city/transit` returns cached alerts or `[]`.

3. **Frontend** (`packages/web/src/components/panels/TransitPanel.tsx`) — Displays alerts sorted by severity (high first) with colored line badges (U=blue, S=green, Tram=red, Bus=yellow). Shows "All clear" when empty.

### Key Types

```typescript
interface TransitAlert {
  id: string;           // FNV-1a hash of line:summary
  line: string;         // "U2", "S1", "Bus M29"
  type: 'delay' | 'disruption' | 'cancellation' | 'planned-work';
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedStops: string[];
}
```

### Deduplication

Alerts are deduped by `${line}:${summary}` — the same disruption reported across multiple stations is only shown once.

### Classification

- **Type**: German keywords → cancellation (`Ausfall`), planned-work (`Bauarbeit`, `Sperrung`), delay (`Verspätung`), disruption (default)
- **Severity**: cancellation/Sperrung/Störung → high, delay → medium, other → low

### DB Schema

`transitDisruptions` table is defined in `schema.ts` but not yet wired to runtime — cache-only for now, same as weather and AI summaries. Will be persisted when DB connection is established.
