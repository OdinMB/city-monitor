# Plan: Transit Detail & Map Markers

## Problem

Transit alerts show vague information like "U8 — Elevator out of service" with no station or details. The VBB API provides much more data that we discard:
- `remark.text` — detailed description (e.g., "The lift at S+U Alexanderplatz station (street <> platform U2) will be repaired shortly.")
- `departure.stop` — station name and lat/lon
- `remark.validFrom/validUntil` — date range
- We only poll 3 stations, missing disruptions at smaller stations

## Changes

### 1. Move station IDs into city config

**File: `shared/types.ts`**
- Add `stations` field to `CityDataSources.transit`: `stations?: Array<{ id: string; name: string }>`

**File: `packages/server/src/config/cities/berlin.ts`**
- Add ~12 interchange stations covering all S+U lines:

| Station | ID | Lines Covered |
|---|---|---|
| Alexanderplatz | 900100003 | U2, U5, U8, S3, S5, S7, S9, S75 |
| Hauptbahnhof | 900003201 | S3, S5, S7, S9, S75 |
| Zoologischer Garten | 900120005 | U2, U9, S3, S5, S7, S9 |
| Friedrichstraße | 900100001 | U6, S1, S2, S25, S26, S3, S5, S7, S9 |
| Gesundbrunnen | 900007102 | U8, S1, S2, S25, S26, S41, S42, S8, S85 |
| Ostkreuz | 900120004 | S3, S5, S7, S8, S85, S9, S75, S41, S42 |
| Südkreuz | 900058101 | S2, S25, S26, S41, S42, S45, S46, S47 |
| Westkreuz | 900024101 | S3, S5, S7, S9, S41, S42, S45, S46 |
| Nollendorfplatz | 900013101 | U1, U2, U3, U4 |
| Mehringdamm | 900017101 | U6, U7 |
| Hermannplatz | 900013102 | U7, U8 |
| Spandau | 900029101 | U7, S3, S9 |

This set covers all 9 U-Bahn lines and all 16 S-Bahn lines. 12 requests per poll cycle (every 5 min) = well within VBB's 100 req/min rate limit.

**Hamburg**: Hamburg's HVV transport.rest API is deprecated and offline (ECONNREFUSED). No working free API for Hamburg local transit has been found. Leave Hamburg's transit config as-is (no stations) — the ingestion will skip it gracefully. If/when a Hamburg API becomes available, just add stations to the config.

### 2. Enrich TransitAlert type

**File: `packages/server/src/cron/ingest-transit.ts` (TransitAlert type)**
Add fields:
```typescript
export interface TransitAlert {
  id: string;
  line: string;
  type: 'delay' | 'disruption' | 'cancellation' | 'planned-work';
  severity: 'low' | 'medium' | 'high';
  message: string;        // remark.summary (short headline)
  detail: string;         // NEW: remark.text (full description)
  station: string;        // NEW: departure.stop.name
  location: { lat: number; lon: number } | null; // NEW: departure.stop.location
  affectedStops: string[];
}
```

**File: `packages/web/src/lib/api.ts` (client TransitAlert)**
Mirror the same additions.

### 3. Capture richer data from VBB API

**File: `packages/server/src/cron/ingest-transit.ts`**
- Expand `VbbDeparture` interface to include `stop?: { name?: string; location?: { latitude?: number; longitude?: number } }`
- Read station list from city config instead of hardcoded `BERLIN_STATIONS`
- Use `remark.text` for the new `detail` field (fallback to `summary` if empty)
- Use `departure.stop.name` for the new `station` field
- Use `departure.stop.location` for the new `location` field
- Deduplicate by `remark.summary` (not `line:summary`), since the same elevator outage may appear across multiple lines at the same station
- Use the VBB endpoint base from city config `transit.endpoint` (default `https://v6.vbb.transport.rest` for Berlin, `https://v6.hvv.transport.rest` for Hamburg)

### 4. Update DB schema + persistence

**File: `packages/server/src/db/schema.ts`**
- Add columns to `transitDisruptions`: `detail text`, `station text`, `lat real`, `lon real`

**File: `packages/server/src/db/writes.ts`**
- Persist the new fields

**File: `packages/server/src/db/reads.ts`**
- Read and return the new fields

### 5. Update UI — expandable detail

**File: `packages/web/src/components/strips/TransitStrip.tsx`**
Each alert card shows:
- **Line badge** + **type** (as now)
- **Station name** as subheading (new)
- **message** (summary) — always visible
- **detail** — expandable on click (if different from message)
- **affectedStops** (as now)

Use a simple state toggle per alert for expand/collapse.

### 6. Add transit markers to map

**File: `packages/web/src/components/map/CityMap.tsx`**
- Accept transit alerts as a prop or read via `useTransit` hook
- Add a GeoJSON source `transit-markers` with alert locations as Point features
- Add a circle + symbol layer for disruption markers
- Style: red/amber/gray circles based on severity
- On click: show popup with line badge, station, message

**File: `packages/web/src/components/layout/CommandLayout.tsx`**
- Pass transit data to map or let CityMap fetch it directly

### 7. Generate DB migration

Run `npm run db:generate` from `packages/server` after schema changes.

## Files Changed

| File | Type |
|---|---|
| `shared/types.ts` | Modify — add stations to transit config |
| `packages/server/src/config/cities/berlin.ts` | Modify — add station list |
| `packages/server/src/config/cities/hamburg.ts` | No change (HVV API offline) |
| `packages/server/src/cron/ingest-transit.ts` | Modify — enrich data capture |
| `packages/server/src/db/schema.ts` | Modify — add columns |
| `packages/server/src/db/writes.ts` | Modify — persist new fields |
| `packages/server/src/db/reads.ts` | Modify — read new fields |
| `packages/web/src/lib/api.ts` | Modify — mirror TransitAlert type |
| `packages/web/src/components/strips/TransitStrip.tsx` | Modify — station label + expandable detail |
| `packages/web/src/components/map/CityMap.tsx` | Modify — add transit markers layer |
| `packages/web/src/components/layout/CommandLayout.tsx` | Possibly modify |

## Implementation Order

1. Update `shared/types.ts` — add station list to transit config type
2. Update city configs (Berlin + Hamburg) — add station IDs and endpoints
3. Update `ingest-transit.ts` — richer data capture, config-driven stations
4. Update DB schema + writes + reads — new columns
5. Update client `api.ts` — mirror type
6. Update `TransitStrip.tsx` — station label + expandable detail
7. Update `CityMap.tsx` — transit marker layer
8. Generate DB migration
9. Run typecheck + tests
