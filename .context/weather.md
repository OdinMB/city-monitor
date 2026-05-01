# Weather System

## Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-weather.ts`) — Runs every 30 minutes. Fetches current conditions, hourly forecast (24h), and daily forecast (5 days) from Open-Meteo. For German cities (`country === 'DE'`), also fetches severe weather alerts from DWD. Writes to cache key `{cityId}:weather` (TTL 1800s) and persists to Postgres if DB connected.

2. **API** (`packages/server/src/routes/weather.ts`) — `GET /api/:city/weather` returns cached data, falls back to Postgres, then returns empty structure `{ current: null, hourly: [], daily: [], alerts: [] }`.

3. **Frontend** (`packages/web/src/components/panels/WeatherPanel.tsx`) — Uses `useWeather()` hook (refetch 15 min). Displays current conditions with WMO weather code emoji/labels, hourly/daily forecasts, and alerts if present.

## Data Sources

### Open-Meteo (all cities)

- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Auth:** None required (free tier, unlimited requests)
- **Timeout:** 10s
- **Query params:** latitude, longitude, current/hourly/daily field lists, timezone, `forecast_days=7`
- **Returns:** Current weather (temp, humidity, feels-like, precipitation, wind, WMO weather code, UV index, UV index clear sky), hourly arrays (temp, precip probability, weather code, UV index), daily arrays (high/low, precip sum, sunrise/sunset, weather code, UV index max, UV index clear sky max)

### DWD — Deutscher Wetterdienst (German cities only)

- **Endpoint:** `https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json`
- **Format:** JSONP wrapper (`warnWetter.loadWarnings({...})`) — stripped before parsing
- **Filtering:** Warnings keyed by region code; matched against city name in `regionName`. Only severity >= 2 surfaced (minor advisories skipped).
- **Severity mapping:** 2 = severe, 3+ = extreme

### DWD UV Index (German cities only)

- **Endpoint:** `https://opendata.dwd.de/climate_environment/health/alerts/uvi.json`
- **Format:** JSON with `content` array of `{ city, forecast: { today, tomorrow, dayafter_to } }`
- **Matching:** City name exact match (case-insensitive)
- **Schedule:** Updated once daily (07:30 UTC); fetched alongside Open-Meteo weather every 30 min
- **Data:** 3-day UV index forecast (WHO scale 0–11+), stored as `dwdUv` on `WeatherData`

## Key Types

```typescript
// Shared type from @city-monitor/shared
interface WeatherData {
  current: CurrentWeather;   // temp, feelsLike, humidity, precipitation, weatherCode, windSpeed, windDirection, uvIndex?, uvIndexClearSky?
  hourly: HourlyForecast[];  // time, temp, precipProb, weatherCode, uvIndex?
  daily: DailyForecast[];    // date, high, low, weatherCode, precip, sunrise, sunset, uvIndexMax?, uvIndexClearSkyMax?
  alerts: WeatherAlert[];    // headline, severity ('extreme'|'severe'|'moderate'), description, validUntil
  dwdUv?: DwdUvForecast;     // today, tomorrow, dayAfter (German cities only)
}
```

## Frontend Utilities

- `packages/web/src/lib/weather-codes.ts` — Maps WMO weather codes to emoji + label. Handles clear/cloudy (0-3), fog (45-48), drizzle (51-57), rain (61-67), snow (71-77), showers (80-82), snow showers (85-86), thunderstorms (95-99). Fallback: "Unknown".
- `packages/web/src/lib/uv-levels.ts` — Maps UV index to WHO level (low/moderate/high/veryHigh/extreme) and color. Floors fractional values.

## Diagnostics

When weather appears stale in production, run `npm run check:weather` (from `packages/server/`) to probe all four upstreams (Open-Meteo forecast, Open-Meteo air-quality, DWD warnings, DWD UV) end-to-end. Exits 0 if all return 200 + the expected shape, 1 if any fail. Add `-- --city hamburg` to probe Hamburg coordinates instead of Berlin. The script is not picked up by `vitest` / `turbo run test`.

## DB Schema

Unified `snapshots` table, type `open-meteo` — `data` JSONB contains `{ current, hourly, daily, alerts }`. No staleness guard on reads — `loadWeather()` always returns the latest row regardless of age. The frontend freshness system (TileFooter, 45-min threshold) handles stale display. Note: `dwdUv` is NOT persisted to DB — it only lives in the in-memory cache and is re-fetched on each cron run.
