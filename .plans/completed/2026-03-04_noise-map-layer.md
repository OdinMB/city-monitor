# Noise Map Layer

## Summary

Add noise data to the map: strategic noise maps (WMS overlay, both cities) + live community noise sensors (point markers, Berlin only).

## Data Sources

### 1. Strategic Noise Maps (both cities)

Static GIS data computed every 5 years under the EU Environmental Noise Directive. Published as WMS endpoints:

- **Berlin:** `https://gdi.berlin.de/services/wms/ua_stratlaerm_2022`
  - LDEN: `bf_gesamtlaerm_den2022` (total), `bb_strasse_gesamt_den2022` (road), `bc_tram_ubahn_den2022` (rail), `bd_flug_gesamt_den2022` (air)
  - License: Datenlizenz Deutschland Zero 2.0

- **Hamburg:** `https://geodienste.hamburg.de/wms_strategische_laermkarten`
  - LDEN: `strasse_tag` (road), `schiene_tag` (rail), `flug_tag` (air)
  - No total/combined layer
  - License: Datenlizenz Deutschland Namensnennung 2.0

### 2. Live Noise Sensors (Berlin only)

Sensor.Community DNMS (Digital Noise Measurement Sensor) — citizen-operated, near real-time (5-min averages).

- **API:** `https://data.sensor.community/airrohr/v1/filter/area=52.52,13.405,15`
- **Berlin coverage:** 9 sensors (as of 2026-03-04)
- **Hamburg coverage:** 1 sensor (too sparse — skip)
- **Fields:** `noise_LAeq` (equivalent continuous level), `noise_LA_min`, `noise_LA_max` — all in dB(A)
- **License:** Open Data (DbOL)

## Architecture

### Part 1: WMS Overlay (frontend only)

Follows the rent map WMS pattern (`setRentMapOverlay` in `base.ts`). No server changes. MapLibre consumes WMS tiles directly from city geo-data servers.

### Part 2: Live Sensors (full stack, Berlin only)

Follows the pollen/air-quality pattern: cron → cache + DB → API route → React Query hook → map markers.

- Cron fetches the area API every 10 minutes, filters for DNMS noise sensors
- Stores as JSONB snapshot (like pollen, wastewater)
- Live sensor markers shown as points on the map when noise layer is active

## Sub-layers

Noise is a parent layer with mutually exclusive sub-layers (like social/population):

| Sub-layer | What it shows |
|-----------|---------------|
| `total`   | WMS total noise (Berlin only) + live sensors |
| `road`    | WMS road traffic noise + live sensors |
| `rail`    | WMS rail traffic noise + live sensors |
| `air`     | WMS air traffic noise + live sensors |

Default: `total` for Berlin, `road` for Hamburg. Live sensor markers always visible (Berlin) regardless of sub-layer selection. The `total` sub-layer toggle is hidden for Hamburg.

## Files to Change

### Part 1: WMS Overlay (frontend only)

**`packages/web/src/hooks/useCommandCenter.ts`**
- Add `'noise'` to `DataLayer` union
- Add `NoiseLayer = 'total' | 'road' | 'rail' | 'air'` type
- Add `noiseLayer: NoiseLayer` state (default: `'total'`)
- Add `setNoiseLayer` setter

**`packages/web/src/components/map/constants.ts`**
- Add `NOISE_SOURCE`, `NOISE_LAYER` constants
- Add WMS URL config per city mapping `NoiseLayer` → WMS layer name
- Add `getNoiseWmsUrl(cityId, noiseLayer)` helper

**`packages/web/src/components/map/base.ts`**
- Add `setNoiseOverlay(map, visible, cityId, noiseLayer)` function
- Add `noise-` prefix to `simplifyMap` whitelist

**`packages/web/src/components/map/CityMap.tsx`**
- Read noise state from Zustand, compute `noiseActive`
- Add refs + useEffect to call `setNoiseOverlay`
- Wire into `style.load` handler

**`packages/web/src/components/sidebar/DataLayerToggles.tsx`**
- Add `{ layer: 'noise', icon: Volume2, color: '#f97316' }` to `LAYER_META` (after air-quality)
- Add `NOISE_SUB_META` array
- Add noise sub-layer rendering (mutually exclusive, filter `total` to Berlin only)

### Part 2: Live Sensors (full stack, Berlin only)

**`shared/types.ts`**
- Add `NoiseSensor` interface: `{ id: number; lat: number; lon: number; laeq: number; laMin: number; laMax: number }`
- Add `noiseSensors?` to `CityDataSources`

**`shared/schemas.ts`**
- Add `NoiseSensorSchema` Zod schema

**`packages/server/src/config/cities/berlin.ts`**
- Add `noiseSensors: { provider: 'sensor-community', lat: 52.52, lon: 13.405, radius: 15 }` to data sources

**`packages/server/src/lib/cache-keys.ts`**
- Add `CK.noiseSensors(cityId)` key
- Add to `bootstrapKeys`

**`packages/server/src/db/schema.ts`**
- Add `noiseSensorSnapshots` table (id, cityId, data jsonb, fetchedAt)

**DB migration**
- `npm run db:generate` + `npm run db:migrate`

**`packages/server/src/db/writes.ts`**
- Add `saveNoiseSensors(db, cityId, data)`

**`packages/server/src/db/reads.ts`**
- Add `loadNoiseSensors(db, cityId)`

**`packages/server/src/cron/ingest-noise-sensors.ts`**
- Factory function `createNoiseSensorIngestion(cache, db)`
- Fetches area API, filters for entries with `noise_LAeq` value type
- Maps to `NoiseSensor[]`, writes cache + DB

**`packages/server/src/routes/noise-sensors.ts`**
- `GET /:city/noise-sensors` — 3-tier read (cache → DB → null)

**`packages/server/src/app.ts`**
- Import + instantiate cron, add to FRESHNESS_SPECS + jobs array
- Mount route with `cacheFor(300)` (5-min cache)

**`packages/server/src/db/warm-cache.ts`**
- Add `loadNoiseSensors` to Berlin-only warming block

**`packages/server/src/cron/data-retention.ts`**
- Add `noiseSensorSnapshots` to retention cleanup

**`packages/web/src/lib/api.ts`**
- Add `noiseSensors` to `BootstrapData`
- Add `api.getNoiseSensors(city)`

**`packages/web/src/hooks/useBootstrap.ts`**
- Seed `['noise-sensors', cityId]` from bootstrap

**`packages/web/src/hooks/useNoiseSensors.ts`**
- React Query hook, 10-min refetch

**`packages/web/src/components/map/layers/noise-sensors.ts`**
- `updateNoiseSensorMarkers(map, sensors, isDark)` — point markers with dB value labels
- Color by noise level: green (<45), yellow (45-55), orange (55-65), red (>65)

**`packages/web/src/components/map/CityMap.tsx`**
- Wire noise sensor markers (show when noise layer active + city is Berlin)

### Shared

**`packages/web/src/pages/SourcesPage.tsx`**
- Add noise map entries (both cities) + Sensor.Community entry (Berlin)

**i18n translation files (DE/EN/TR/AR)**
- `sidebar.layers.noise`, `sidebar.noise.total/road/rail/air`

**`.context/noise.md`** (new context file)
- Document the noise layer architecture

**`CLAUDE.md`**
- Add reference to `.context/noise.md`

## Layer position

After Air Quality in the sidebar toggle list.
