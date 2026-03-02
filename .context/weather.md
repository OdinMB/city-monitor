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
- **Query params:** latitude, longitude, current/hourly/daily field lists, timezone, `forecast_days=5`
- **Returns:** Current weather (temp, humidity, feels-like, precipitation, wind, WMO weather code), hourly arrays (temp, precip probability, weather code), daily arrays (high/low, precip sum, sunrise/sunset, weather code)

### DWD — Deutscher Wetterdienst (German cities only)

- **Endpoint:** `https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json`
- **Format:** JSONP wrapper (`warnWetter.loadWarnings({...})`) — stripped before parsing
- **Filtering:** Warnings keyed by region code; matched against city name in `regionName`. Only severity >= 2 surfaced (minor advisories skipped).
- **Severity mapping:** 2 = severe, 3+ = extreme

## Key Types

```typescript
// Shared type from @city-monitor/shared
interface WeatherData {
  current: CurrentWeather;   // temp, feelsLike, humidity, precipitation, weatherCode, windSpeed, windDirection
  hourly: HourlyForecast[];  // time, temp, precipProb, weatherCode
  daily: DailyForecast[];    // date, high, low, weatherCode, precip, sunrise, sunset
  alerts: WeatherAlert[];    // headline, severity ('extreme'|'severe'|'moderate'), description, validUntil
}
```

## Frontend Utilities

- `packages/web/src/lib/weather-codes.ts` — Maps WMO weather codes to emoji + label. Handles clear/cloudy (0-3), fog (45-48), drizzle (51-57), rain (61-67), snow (71-77), showers (80-82), snow showers (85-86), thunderstorms (95-99). Fallback: "Unknown".

## DB Schema

`weatherSnapshots` table — `current`, `hourly`, `daily` stored as JSONB, `alerts` as JSONB (nullable).
