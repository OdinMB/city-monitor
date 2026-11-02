# Noise Map & Sensors

Two complementary noise data features: WMS strategic noise maps (Berlin, Hamburg, Köln) and live Sensor.Community DNMS markers (Berlin only).

## 1. WMS Strategic Noise Map (Frontend Only)

EU Directive 2002/49/EC strategic noise maps served as WMS tile overlays. No backend — the browser fetches tiles directly.

### Data Sources

- **Berlin:** `https://gdi.berlin.de/services/wms/ua_stratlaerm_2022` (SenMVKU, 2022 data; still the newest round on 2026-11-01: daten.berlin.de lists 2007–2022, the next EU round is 2027)
- **Hamburg:** `https://geodienste.hamburg.de/wms_strategische_laermkarten`, published by LGV Hamburg under dl-de/zero-2-0 (GetCapabilities `<Fees>`, checked 2026-11-01; no attribution required, credited anyway)
- **Köln:** `https://www.wms.nrw.de/umwelt/laerm` ("WMS Umgebungslärmkartierung 2022 Runde 4", LANUV NRW, statewide), dl-de/by-2.0 with the credit "Land NRW" (GetCapabilities `<AccessConstraints>`, checked 2026-11-02). **It renders only at 1:75,500 or closer** (`MaxScaleDenominator`), which a 256px web-mercator tile reaches at zoom 13; further out it returns empty tiles. `NOISE_WMS_MIN_ZOOM` gives the raster source that `minzoom`, and the sidebar shows "zoom in to street level" under the noise sub-layers for such a city.
- **München: not built.** Bavaria's LfU publishes the 2022 round for its agglomerations, München included, at `https://www.lfu.bayern.de/gdi/wms/laerm/ballungsraeume` (CC BY 4.0, credit "Datenquelle: Bayerisches Landesamt für Umwelt, www.lfu.bayern.de"; layers `aggroadlden2022` road and `aggraillden2022` tram/U-Bahn, no air or total layer). On 2026-11-02 the same GetMap request came back empty about half the time (10 identical requests: 5 with data, 5 fully transparent), so the map would show random holes. Re-test before building; the config would be the same three entries as Köln's without a minimum zoom.
- **Update frequency:** ~5 years (EU directive cycle)

### Sub-Layers

4 WMS noise sub-layers with radio-style selection (one active at a time, deselectable on Berlin where live sensors provide fallback visibility):

| Sub-layer | Berlin WMS Layer | Hamburg WMS Layer | Köln WMS Layer |
|-----------|-----------------|-------------------|----------------|
| Total | `bf_gesamtlaerm_den2022` | *(not available)* | *(not available)* |
| Road | `bb_strasse_gesamt_den2022` | `strasse_tag` | `STR_DEN` |
| Rail | `bc_tram_ubahn_den2022` | `schiene_tag` | `SCS_DEN,SCB_DEN` (Stadtbahn and Deutsche Bahn in one request) |
| Air | `bd_flug_gesamt_den2022` | `flug_tag` | `FLG_DEN` |

Hamburg and Köln have no "total" combined layer — the UI falls back to "road" when Total is selected for them (`effectiveNoiseLayer` in `lib/map-layers.ts`).

### Architecture

- **Zustand:** `noiseLayer` state (`NoiseWmsLayer = NoiseLayer | null`) in `useCommandCenter` — null means no WMS map active
- **Map:** `setNoiseOverlay()` in `base.ts` — adds/removes raster source+layer (same pattern as rent map)
- **Constants:** `NOISE_WMS_LAYERS`, `getNoiseWmsUrl()` in `constants.ts`
- **Sidebar:** Noise parent + sub-layer buttons in `DataLayerToggles.tsx`

## 2. Live Noise Sensors (Berlin Only)

Sensor.Community Digital Noise Measuring Sensors (DNMS) — citizen-science project with ~9 active sensors in Berlin.

### Data Source

- **Provider:** Sensor.Community
- **API:** `https://data.sensor.community/airrohr/v1/filter/area=52.52,13.405,15`
- **Format:** JSON array of sensor readings, filtered for `noise_LAeq` value type
- **License:** Open Data (DbOL)
- **Update frequency:** Sensors report every ~2.5 min; we poll every 10 min
- **Cron:** `*/10 * * * *`

### Architecture

Standard data source pattern:
- **Config:** `berlin.ts` — `dataSources.noiseSensors: { provider, lat, lon, radius }`
- **Cron:** `ingest-noise-sensors.ts` — fetches area API, filters DNMS entries
- **Parser:** `parseNoiseSensors()` — exported pure function
- **DB:** Unified `snapshots` table, type `sc-dnms`
- **Cache:** TTL 1200s (20 min), cache key `{cityId}:noise-sensors` (`CK.noiseSensors`)
- **Route:** `GET /:city/noise-sensors` — 3-tier read (cache → DB → null)
- **Bootstrap:** Included (small payload)
- **Warm cache:** Berlin-only block
- **Retention:** 2 days plus the 100-row cap (`CAPPED_RETENTION` in `cron/data-retention.ts`); DB reads refuse rows older than 2 h

### Frontend

- **Hook:** `useNoiseSensors.ts` — 5-min stale, 10-min refetch
- **Map layer:** `layers/noise-sensors.ts` — badge icons (Volume2 glyph with the dB value) coloured by level
  - Green (<45 dB), Yellow (45–55), Orange (55–65), Red (>65)
  - Popups show LAeq, LAmin, LAmax values
- **Visibility:** Markers appear when "Noise" layer is on AND "Live Sensors" sub-item is active (`noiseLiveData` in store). Live sensors are independently toggleable from WMS maps. Default: on.

### Noise Level Thresholds

| LAeq (dB) | Label | Color |
|-----------|-------|-------|
| < 45 | Quiet | Green (#22c55e) |
| 45–55 | Moderate | Yellow (#eab308) |
| 55–65 | Loud | Orange (#f97316) |
| > 65 | Very Loud | Red (#ef4444) |

## Key Files

### WMS Overlay
- `packages/web/src/hooks/useCommandCenter.ts` — `NoiseLayer` type, `noiseLayer` state
- `packages/web/src/components/map/constants.ts` — `NOISE_WMS_LAYERS`, `getNoiseWmsUrl()`
- `packages/web/src/components/map/base.ts` — `setNoiseOverlay()`
- `packages/web/src/components/map/CityMap.tsx` — noise effects and refs
- `packages/web/src/components/sidebar/DataLayerToggles.tsx` — noise layer buttons

### Live Sensors
- `shared/types.ts` — `NoiseSensor` interface
- `shared/schemas.ts` — `NoiseSensorSchema`
- `packages/server/src/cron/ingest-noise-sensors.ts`
- `packages/server/src/routes/noise-sensors.ts`
- `packages/web/src/hooks/useNoiseSensors.ts`
- `packages/web/src/components/map/layers/noise-sensors.ts`
