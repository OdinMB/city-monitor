# Air Quality Map Visualization

## Goal

Show air quality levels spatially across the city map when the `air-quality` data layer toggle is active. Colored circles at ~27 official WAQI station locations, displaying AQI values.

## Data Source

### WAQI/AQICN API
- **~27 official stations** in Berlin area
- Free, requires API token (free registration at aqicn.org)
- Bounding box endpoint: `https://api.waqi.info/map/bounds/?latlng={lat1},{lng1},{lat2},{lng2}&token={token}`
- Returns pre-computed AQI per station with coordinates
- Env var: `WAQI_API_TOKEN`

## Implementation (completed)

### Server
- **`packages/server/src/cron/ingest-air-quality-grid.ts`** — WAQI bounding box fetch, caches as `${city.id}:air-quality:grid` with 1800s TTL
- **`packages/server/src/routes/air-quality.ts`** — Added `GET /:city/air-quality/grid` endpoint
- **`packages/server/src/app.ts`** — Wired `ingest-aq-grid` cron job (every 30 min)
- **`shared/types.ts`** — `AirQualityGridPoint` type in shared package

### Frontend
- **`packages/web/src/lib/api.ts`** — Re-exports `AirQualityGridPoint` from shared, adds `api.getAirQualityGrid()`
- **`packages/web/src/hooks/useAirQualityGrid.ts`** — React Query hook (30 min refetch)
- **`packages/web/src/components/map/CityMap.tsx`** — Circle layer with AQI-colored circles + number labels, popups on click

### Env Vars

| Var | Required | Default |
|-----|----------|---------|
| `WAQI_API_TOKEN` | No | If missing, grid ingestion skips silently |
