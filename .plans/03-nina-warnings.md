# Plan: NINA Civil Protection Warnings

## Problem

The dashboard shows DWD weather alerts but misses other civil protection warnings — chemical spills, fires, floods, police alerts, infrastructure failures. The NINA (Notfall-Informations- und Nachrichten-App) system aggregates warnings from multiple German authorities into one API.

## NINA API

**Base URL**: `https://warnung.bund.de/api31`

**Key endpoints**:
| Endpoint | Purpose |
|---|---|
| `/dashboard/{ARS}.json` | Current warnings for a region by Amtlicher Regionalschlüssel |
| `/warnings/{identifier}.json` | Full warning detail (CAP format) |
| `/warnings/{identifier}.geojson` | Warning area as GeoJSON polygon |
| `/katwarn/mapData.json` | All Katwarn warnings (map overlay) |
| `/biwapp/mapData.json` | All BIWAPP warnings |
| `/mowas/mapData.json` | All MoWaS warnings (civil protection) |
| `/dwd/mapData.json` | All DWD weather warnings |
| `/lhp/mapData.json` | All flood portal warnings |
| `/police/mapData.json` | All police warnings |

**Regional keys (ARS)**:
- Berlin (state level): `110000000000` (11 = Berlin, padded with zeros)
- Hamburg (state level): `020000000000` (02 = Hamburg)

**Warning sources aggregated by NINA**:
- **MoWaS** (Modulares Warnsystem): Civil protection authorities
- **BIWAPP**: Municipal warnings
- **Katwarn**: Fire departments, chemical industry
- **DWD**: German weather service (already integrated separately)
- **LHP**: Länderhochwasserportal — flood warnings
- **Police**: Police warnings for active threat situations

**Important**: The API at `/api31/` is not officially a public API — it's the backend for the NINA app and warnung.bund.de website. The data structure can change without notice. We should implement defensive parsing.

**No authentication required. No rate limit documented (but poll conservatively).**

## Design

### Data Model

```typescript
interface NinaWarning {
  id: string;           // Warning identifier
  version: number;      // Version of this warning
  startDate: string;    // ISO timestamp
  expiresAt?: string;   // ISO timestamp (if available)
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  urgency?: string;     // 'immediate' | 'expected' | 'future'
  type: string;         // Event code (e.g., 'NATURAL_HAZARD', 'CHEMICAL', 'FIRE')
  source: 'mowas' | 'biwapp' | 'katwarn' | 'dwd' | 'lhp' | 'police';
  headline: string;     // i18nTitle from dashboard
  description?: string; // Full text from detail endpoint
  instruction?: string; // Safety instructions
  area?: {              // GeoJSON polygon (from .geojson endpoint)
    type: 'Feature';
    geometry: GeoJSON.Geometry;
  };
}
```

### Ingestion Strategy

**New cron job**: `ingest-nina.ts`
- **Schedule**: Every 10 minutes (`*/10 * * * *`)
- **Process**:
  1. Fetch `/dashboard/{ARS}.json` for each active German city
  2. Parse warning list (id, version, startDate, severity, type, headline)
  3. For each warning, check if we already have this version cached
  4. For new/updated warnings, fetch `/warnings/{id}.json` for full detail
  5. Optionally fetch `/warnings/{id}.geojson` for map polygon
  6. Filter out DWD weather warnings (already handled by `ingest-weather.ts`) to avoid duplicates
  7. Cache as `{cityId}:nina:warnings` (TTL: 600s)
  8. Persist to DB if connected

**Deduplication with DWD**:
- Skip warnings where `source === 'dwd'` since we already have DWD alerts via `ingest-weather.ts`
- This avoids showing the same storm warning twice

### API Route

**New route**: `GET /api/:city/nina`
- Returns `NinaWarning[]`
- Cache-first, DB fallback, empty array default

**Bootstrap integration**: Add `nina` to the bootstrap endpoint's `getBatch()` call.

### Database Schema

**New table**: `ninaWarnings`
```sql
CREATE TABLE nina_warnings (
  id serial PRIMARY KEY,
  city_id text NOT NULL,
  warning_id text NOT NULL,
  version integer NOT NULL,
  source text NOT NULL,
  severity text NOT NULL,
  headline text NOT NULL,
  description text,
  instruction text,
  start_date timestamp NOT NULL,
  expires_at timestamp,
  area jsonb,
  fetched_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX nina_city_idx ON nina_warnings (city_id, start_date);
```

**Data retention**: 7 days (same as safety reports).

### Frontend

**New hook**: `useNina(cityId)` — refetch every 5 minutes, stale time 2 minutes

**Display options**:

#### Option A: Integrate into existing weather panel
- Show NINA warnings alongside DWD alerts in WeatherPanel
- Pro: Centralized alert location, no new panel needed
- Con: Conflates weather with civil protection

#### Option B: Dedicated alerts banner (Recommended)
- Full-width alert banner at the top of the content area (above all strips)
- Only visible when there are active warnings
- Severity-based styling: red (extreme/severe), amber (moderate), yellow (minor)
- Expandable for description + instructions
- Dismissable per-warning (client-side, stored in localStorage)

#### Option C: Separate alerts strip
- New `NinaStrip` component alongside other strips
- Always visible slot, shows "No active warnings" when empty

**Map integration**:
- Render GeoJSON warning areas as semi-transparent polygons on the map
- Color by severity (red/amber/yellow)
- Click to show popup with headline + description
- New layer toggle: "Warnings" in DataLayerToggles

### Non-German Cities

NINA is Germany-only. The ingestion job should check `city.country === 'DE'` before fetching. The frontend should gracefully hide the NINA UI for non-German cities.

## Files Changed

| File | Change |
|---|---|
| `shared/types.ts` | Add NinaWarning type |
| `packages/server/src/cron/ingest-nina.ts` | New — NINA ingestion cron job |
| `packages/server/src/routes/nina.ts` | New — API route |
| `packages/server/src/db/schema.ts` | Add ninaWarnings table |
| `packages/server/src/db/writes.ts` | Add saveNinaWarnings() |
| `packages/server/src/db/reads.ts` | Add loadNinaWarnings() |
| `packages/server/src/db/warm-cache.ts` | Warm nina cache on startup |
| `packages/server/src/app.ts` | Register cron job + route |
| `packages/server/src/routes/news.ts` | Add nina to bootstrap |
| `packages/web/src/lib/api.ts` | Add NinaWarning type + API method |
| `packages/web/src/hooks/useNina.ts` | New — React Query hook |
| `packages/web/src/components/alerts/NinaBanner.tsx` | New — alert banner component |
| `packages/web/src/components/map/CityMap.tsx` | Add warning area polygons |
| `packages/web/src/stores/useCommandCenter.ts` | Add 'warnings' layer toggle |

## Implementation Order

1. Define NinaWarning type in shared/types.ts
2. Create ingest-nina.ts cron job
3. Create DB schema + writes/reads
4. Create API route + register in app.ts
5. Add to bootstrap endpoint + cache warming
6. Create frontend hook + API client method
7. Create NinaBanner component
8. Add warning polygons to CityMap
9. Add layer toggle
10. Generate DB migration
11. Typecheck

## Decisions

- **Display approach**: Dedicated full-width alert banner (Option B) — warnings deserve prominent, impossible-to-miss placement.
- **GeoJSON polygons**: Fetch GeoJSON per warning for accurate map areas. Warning polygons are the killer feature for a map-based dashboard.
- **DWD deduplication**: Skip DWD-sourced NINA warnings — existing DWD integration is proven.
- **Polling frequency**: 5 minutes — warnings are time-critical.
