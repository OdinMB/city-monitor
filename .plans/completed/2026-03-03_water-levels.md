# Water Levels (PEGELONLINE)

Add water level monitoring for Berlin (Spree/Havel/Dahme) and Hamburg (Elbe) using the PEGELONLINE REST API. Map markers show gauge stations color-coded by status; an info tile shows current levels with reference values.

## Context

- **API:** `https://www.pegelonline.wsv.de/webservices/rest-api/v2` — no auth, DL-DE-Zero license, 15-min updates
- Single batch call fetches all stations: `GET /stations.json?ids={uuid1},{uuid2},...&includeTimeseries=true&includeCurrentMeasurement=true&includeCharacteristicValues=true`
- Berlin stations return `stateMnwMhw` ("low"/"normal"/"high") and NNW/MNW/MW/MHW/HHW characteristic values
- Hamburg Elbe stations are tidal — different characteristic values (MThw/MTnw/HThw/NTnw), `stateMnwMhw` often "unknown"
- No forecasts for Berlin (rivers heavily regulated); Hamburg may have Elbe forecasts

### Stations

**Berlin (5):**
| Station | UUID | Water |
|---|---|---|
| Mühlendamm UP | `09e15cf6-f155-4b76-b92f-6c260839121c` | Spree (city center) |
| Charlottenburg UP | `d89eb759-58c4-43f4-9fe4-e6a21af23f5c` | Spree (west) |
| Köpenick | `47d3e815-c556-4e1b-93de-9fe07329fb00` | Spree (southeast) |
| Spandau UP | `2c68509c-bf1e-4866-9ec4-b26b231e5e04` | Havel (west) |
| Schmöckwitz | `6b595707-8c47-4bc7-a803-dbc327775c26` | Dahme (south) |

**Hamburg (3):**
| Station | UUID | Water |
|---|---|---|
| St. Pauli | `d488c5cc-4de9-4631-8ce1-0db0e700b546` | Elbe (main gauge) |
| Bunthaus | `ae1b91d0-e746-4f65-9f64-2d2e23603a82` | Elbe (east) |
| Seemannshöft | `816affba-0118-4668-887f-fb882ed573b2` | Elbe (west) |

## Decisions

- **Tile design:** Visual gauge bars — horizontal bar per station showing current level within MNW–MHW range
- **Tidal handling:** Same display for Hamburg with "tidal" badge; use MThw/MTnw as reference values
- **Persistence:** Full Postgres + cache (same as weather)

## Changes

### 1. Shared types (`shared/types.ts`)

```ts
export interface WaterLevelStation {
  uuid: string;
  name: string;
  waterBody: string;
  lat: number;
  lon: number;
  currentLevel: number;       // cm
  timestamp: string;           // ISO 8601
  state: 'low' | 'normal' | 'high' | 'very_high' | 'unknown';
  tidal: boolean;              // true for Elbe stations
  characteristicValues?: {
    shortname: string;         // NNW, MNW, MW, MHW, HHW (or MThw, MTnw, etc.)
    value: number;             // cm
  }[];
}

export interface WaterLevelData {
  stations: WaterLevelStation[];
  fetchedAt: string;
}
```

### 2. City config — add `waterLevels` to `CityDataSources`

Add to `CityDataSources`:
```ts
waterLevels?: {
  provider: 'pegelonline';
  stations: Array<{ uuid: string; name: string; waterBody: string; tidal?: boolean }>;
};
```

**Berlin config** — all 5 stations, `tidal: false` (default)
**Hamburg config** — 3 Elbe stations, `tidal: true`

### 3. DB table (`packages/server/src/db/schema.ts`)

```ts
export const waterLevelSnapshots = pgTable('water_level_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  stations: jsonb('stations').notNull(),   // WaterLevelStation[]
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('water_level_city_idx').on(table.cityId),
]);
```

Single JSONB column for the stations array — follows the weather snapshot pattern (one row per city, full replacement).

### 4. Cron job (`packages/server/src/cron/ingest-water-levels.ts`)

- Schedule: `*/15 * * * *` (every 15 min, matching API update frequency)
- `runOnStart: true`
- Factory: `createWaterLevelIngestion(cache, db)`
- For each active city with `dataSources.waterLevels`:
  1. Build batch URL from station UUIDs
  2. Fetch with 10s timeout
  3. Transform API response → `WaterLevelStation[]` (map fields, derive `state`)
  4. `cache.set(`${cityId}:water-levels`, data, 900)` (15 min TTL)
  5. `saveWaterLevels(db, cityId, data)` (DB write)

**State derivation logic:**
- If API provides `stateMnwMhw` and it's not "unknown": map directly ("low"/"normal"/"high")
- If current > MHW (or HThw for tidal): "very_high"
- If API says "unknown" and no characteristic values: "unknown"

### 5. DB reads/writes (`reads.ts`, `writes.ts`)

**`saveWaterLevels`** — delete-then-insert transaction (same as `saveWeather`)
**`loadWaterLevels`** — select single row, return `WaterLevelData | null`

### 6. Cache warming (`warm-cache.ts`)

Add water levels entry: load from DB, set cache with 900s TTL.

### 7. API route (`packages/server/src/routes/water-levels.ts`)

`GET /api/:city/water-levels` — standard three-tier read (cache → DB → empty `{ stations: [], fetchedAt: null }`)

Register in `app.ts` with `cacheFor(300)`.

### 8. Bootstrap integration

- Add `${cityId}:water-levels` to `getBatch()` keys in bootstrap endpoint
- Add `waterLevels` field to bootstrap response
- Add to `BootstrapData` type in `api.ts`
- Seed in `useBootstrap.ts`

### 9. Frontend types + API client (`packages/web/src/lib/api.ts`)

Add `WaterLevelStation` and `WaterLevelData` interfaces (local copies).
Add `getWaterLevels: (city: string) => fetchJson<WaterLevelData>(`${BASE}/${city}/water-levels`)`.

### 10. Frontend hook (`packages/web/src/hooks/useWaterLevels.ts`)

Standard polling hook: `queryKey: ['water-levels', cityId]`, `refetchInterval: 15 * 60 * 1000`, `staleTime: 5 * 60 * 1000`.

### 11. Map layer (in `CityMap.tsx`)

- Add `'water-levels'` to `DataLayer` type in `useCommandCenter.ts`
- Source: `water-level-markers` (GeoJSON point features from station coordinates)
- Layers: `water-level-marker-icon`, `water-level-marker-label`
- Icon color by state: blue (normal), amber (high), red (very_high), gray (unknown/low)
- Register `Droplets` icon from Lucide in `map-icons.ts` for the marker
- Popup: station name, water body, current level, state, timestamp
- Label: show current level in cm below the icon
- Follow the AQ grid pattern — `updateWaterLevelMarkers()` function + useEffect

### 12. Sidebar toggle (`DataLayerToggles.tsx`)

Add to `LAYER_META`: `{ layer: 'water-levels', icon: Droplets, color: '#3b82f6' }` (blue).

### 13. Dashboard tile (`WaterLevelStrip.tsx`)

**Collapsed view:**
- Summary line: number of stations, overall status (e.g. "All normal" or "1 station high")
- Compact row per station: name, water body, current level (cm), color-coded status badge

**Expanded view:**
- Per station: current level shown against reference values (MW bar with min/max range)
- Simple horizontal bar showing where current level sits relative to MNW–MHW range
- Characteristic values listed: MNW, MW, MHW

Add as `<Tile>` in `CommandLayout.tsx`, span=1, expandable.

### 14. i18n (all 4 language files)

```
panel.waterLevels.title
panel.waterLevels.state.low
panel.waterLevels.state.normal
panel.waterLevels.state.high
panel.waterLevels.state.veryHigh
panel.waterLevels.state.unknown
panel.waterLevels.allNormal
panel.waterLevels.stationsHigh
panel.waterLevels.level
panel.waterLevels.meanWater
panel.waterLevels.tidal

sidebar.layers.water-levels
```

### 15. Data retention (`data-retention.ts`)

Add: `water_level_snapshots` older than 7 days.

## Files Modified

| File | Change |
|---|---|
| `shared/types.ts` | Add `WaterLevelStation`, `WaterLevelData`, extend `CityDataSources` |
| `packages/server/src/config/cities/berlin.ts` | Add `waterLevels` config |
| `packages/server/src/config/cities/hamburg.ts` | Add `waterLevels` config |
| `packages/server/src/db/schema.ts` | Add `waterLevelSnapshots` table |
| `packages/server/src/db/writes.ts` | Add `saveWaterLevels` |
| `packages/server/src/db/reads.ts` | Add `loadWaterLevels` |
| `packages/server/src/db/warm-cache.ts` | Add water levels warming |
| `packages/server/src/cron/ingest-water-levels.ts` | **New** — PEGELONLINE ingestion |
| `packages/server/src/cron/ingest-water-levels.test.ts` | **New** — unit tests |
| `packages/server/src/routes/water-levels.ts` | **New** — API route |
| `packages/server/src/routes/water-levels.test.ts` | **New** — unit tests |
| `packages/server/src/app.ts` | Register cron + route |
| `packages/server/src/cron/data-retention.ts` | Add water level cleanup |
| `packages/web/src/lib/api.ts` | Add types + API function |
| `packages/web/src/hooks/useBootstrap.ts` | Seed water levels |
| `packages/web/src/hooks/useWaterLevels.ts` | **New** — polling hook |
| `packages/web/src/hooks/useCommandCenter.ts` | Add `'water-levels'` to DataLayer |
| `packages/web/src/components/map/CityMap.tsx` | Add water level markers |
| `packages/web/src/lib/map-icons.ts` | Register Droplets icon |
| `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Add toggle entry |
| `packages/web/src/components/strips/WaterLevelStrip.tsx` | **New** — info tile |
| `packages/web/src/components/layout/CommandLayout.tsx` | Add tile |
| `packages/web/src/i18n/{en,de,tr,ar}.json` | Translation keys |
| `packages/server/src/routes/news.ts` | Add to bootstrap |

## Test Plan

- **Cron unit tests:** Mock fetch, verify API URL construction, response transformation, state derivation logic, cache + DB writes
- **Route unit tests:** Cache hit, DB fallback, empty sentinel, 404 for unknown city
- **Visual:** Map markers appear at correct coordinates, color-coded by status, popups show correct data, toggle on/off works
- **Tile:** Shows station list, color-coded badges, expanded view shows reference bars
