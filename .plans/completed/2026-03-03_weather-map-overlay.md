# Weather Map Overlay

Add OpenWeatherMap raster tile overlays to the map (precipitation, temperature, clouds, wind), toggled via the existing sidebar layer system.

## Context

- `DataLayer` type already includes `'weather'` but the sidebar skips it — no map visualization exists yet
- i18n key `sidebar.layers.weather` already exists in all 4 language files
- All existing map layers use GeoJSON sources; this is the first raster tile layer
- OpenWeatherMap Weather Maps 1.0 is free (any API key), supports standard `{z}/{x}/{y}` tiles

## Architecture

**Server-side tile proxy** — route proxies OWM tile requests so the API key stays server-side. Consistent with existing architecture (server fetches all external data). Adds caching headers so browsers don't re-fetch tiles on every pan.

### OWM Layer Codes (Weather Maps 1.0)

| Layer | Code | Description |
|-------|------|-------------|
| Precipitation | `precipitation_new` | Rain/snow intensity — the primary use case |
| Temperature | `temp_new` | Air temperature heatmap |
| Clouds | `clouds_new` | Cloud cover |
| Wind | `wind_new` | Wind speed |

## Decisions

- **Server proxy** for OWM tiles (API key stays server-side)
- **Precipitation only** — single layer, no sub-toggles needed
- User will sign up for a free OWM API key and add to `.env`

## Changes

### 1. Server: Tile proxy route (`packages/server/src/routes/weather-tiles.ts`)

New route: `GET /api/weather-tiles/:z/:x/:y.png`

- Hardcoded to `precipitation_new` layer (only layer for now)
- Validates `z`, `x`, `y` as integers
- Proxies to `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid={key}`
- Reads `OPENWEATHERMAP_API_KEY` from env
- Pipes the PNG response back with `Cache-Control: public, max-age=600` (10 min, matches OWM update frequency)
- Returns 404 if API key not configured, 502 if upstream fails

Register in `app.ts` with `cacheFor(600)`.

### 2. Server: Env var

Add `OPENWEATHERMAP_API_KEY` to `.env.sample`.

### 3. Frontend: Sidebar toggle (`DataLayerToggles.tsx`)

- Add `'weather'` entry to `LAYER_META` (icon: `CloudRain`, color: `#0ea5e9`)
- No sub-toggles (precipitation only)

### 4. Frontend: Map integration (`CityMap.tsx`)

- When `activeLayers.has('weather')`: add raster tile source + raster layer
- Source URL: `/api/weather-tiles/{z}/{x}/{y}.png`
- Layer: `type: 'raster'`, `raster-opacity: 0.5`
- When weather deactivated: remove layer + source
- Add `'weather-'` prefix to `simplifyMap` keep-list
- Handle theme/style swaps (re-add source on `styledata` event, same as other layers)

### 5. Attribution

Add "Weather tiles © OpenWeatherMap" to the app footer (AGPL attribution section).

## Files Modified

| File | Change |
|------|--------|
| `packages/server/src/routes/weather-tiles.ts` | **New** — tile proxy route |
| `packages/server/src/routes/weather-tiles.test.ts` | **New** — unit test |
| `packages/server/src/app.ts` | Register weather-tiles router |
| `packages/server/.env.sample` | Add `OPENWEATHERMAP_API_KEY` |
| `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Add weather entry to `LAYER_META` |
| `packages/web/src/components/map/CityMap.tsx` | Add raster tile source/layer + toggle |
| Footer component | OWM attribution |

## Test Plan

- **Server:** Unit test for the proxy route (mock fetch, validate param rejection, 404 on missing key)
- **Visual:** Precipitation overlay visible on map, semi-transparent, toggles on/off cleanly
