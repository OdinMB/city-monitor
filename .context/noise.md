# Noise Map & Sensors

Two complementary noise data features: WMS strategic noise maps (both cities) and live Sensor.Community DNMS markers (Berlin only).

## 1. WMS Strategic Noise Map (Frontend Only)

EU Directive 2002/49/EC strategic noise maps served as WMS tile overlays. No backend — the browser fetches tiles directly.

### Data Sources

- **Berlin:** `https://gdi.berlin.de/services/wms/ua_stratlaerm_2022` (SenMVKU, 2022 data)
- **Hamburg:** `https://geodienste.hamburg.de/wms_strategische_laermkarten`
- **Update frequency:** ~5 years (EU directive cycle)

### Sub-Layers

4 noise sub-layers with mutually exclusive selection:

| Sub-layer | Berlin WMS Layer | Hamburg WMS Layer |
|-----------|-----------------|-------------------|
| Total | `bf_gesamtlaerm_den2022` | *(not available)* |
| Road | `bb_strasse_gesamt_den2022` | `strasse_tag` |
| Rail | `bc_tram_ubahn_den2022` | `schiene_tag` |
| Air | `bd_flug_gesamt_den2022` | `flug_tag` |

Hamburg has no "total" combined layer — the UI falls back to "road" when Total is selected for non-Berlin cities (`effectiveNoiseLayer` in CityMap.tsx).

### Architecture

- **Zustand:** `noiseLayer` state (`'total' | 'road' | 'rail' | 'air'`) in `useCommandCenter`
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
- **DB:** `noise_sensor_snapshots` table (JSONB `data` column)
- **Cache:** TTL 1200s (20 min), cache key `noise-sensors:{cityId}`
- **Route:** `GET /:city/noise-sensors` — 3-tier read (cache → DB → null)
- **Bootstrap:** Included (small payload)
- **Warm cache:** Berlin-only block
- **Retention:** Moderate (7 days)

### Frontend

- **Hook:** `useNoiseSensors.ts` — 5-min stale, 10-min refetch
- **Map layer:** `layers/noise-sensors.ts` — colored circles with dB labels
  - Green (<45 dB), Yellow (45–55), Orange (55–65), Red (>65)
  - Popups show LAeq, LAmin, LAmax values
- **Visibility:** Markers appear when the "Noise" data layer is toggled on

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
