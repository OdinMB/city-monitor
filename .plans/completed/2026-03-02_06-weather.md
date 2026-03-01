# Milestone 06 — Weather

**Goal:** Add current weather and forecast via Open-Meteo (free, no API key).

**Depends on:** [05-news-ui.md](05-news-ui.md) (MVP must be working first)

---

## Steps

### 1. Weather ingestion (`packages/server/src/cron/ingest-weather.ts`)

**Reference:** `.worldmonitor/server/worldmonitor/climate/v1/list-climate-anomalies.ts`
- Uses Open-Meteo Archive API for 30-day climate anomaly detection
- 15 hardcoded zones fetched in parallel with 20s timeout
- Anomaly computation: 7-day avg vs 30-day baseline

For city dashboards, use the **Forecast API** instead of the Archive API (we want current conditions + upcoming weather, not climate anomalies):

```
https://api.open-meteo.com/v1/forecast
  ?latitude={city.dataSources.weather.lat}
  &longitude={city.dataSources.weather.lon}
  &current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m
  &hourly=temperature_2m,precipitation_probability,weather_code
  &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset
  &timezone={city.timezone}
  &forecast_days=5
```

Write to Postgres (`weather_snapshots` table), then update memory cache: `{cityId}:weather` (TTL 1800s / 30 min).

#### Schema addition (`packages/server/src/db/schema.ts`)

```typescript
export const weatherSnapshots = pgTable('weather_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  current: jsonb('current').notNull(),
  hourly: jsonb('hourly').notNull(),
  daily: jsonb('daily').notNull(),
  alerts: jsonb('alerts'),
});
```

### 2. DWD severe weather alerts (Germany-specific)

For German cities, also fetch DWD (Deutscher Wetterdienst) warnings:

```
https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json
```

Filter by city's bounding box coordinates. Cache: `{cityId}:weather:alerts` with 900s (15 min) TTL.

This is optional — only activate for cities where `country === 'DE'`.

### 3. Weather API endpoint

```typescript
GET /api/:city/weather → {
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    precipitation: number;
    weatherCode: number;
    windSpeed: number;
    windDirection: number;
  };
  hourly: { time: string; temp: number; precipProb: number; weatherCode: number }[];
  daily: { date: string; high: number; low: number; weatherCode: number; precip: number; sunrise: string; sunset: string }[];
  alerts?: { headline: string; severity: string; description: string; validUntil: string }[];
}
```

### 4. WeatherPanel (`packages/web/src/components/panels/WeatherPanel.tsx`)

Displays:
- Current temperature (large), feels-like, condition icon
- Weather code → icon/label mapping (WMO standard codes, ~30 codes)
- 24-hour hourly forecast (horizontal scroll, small temp + icon per hour)
- 5-day daily forecast (high/low bars)
- Active severe weather alerts (if any), highlighted in amber/red

### 5. TopBar weather summary

Show current temp + weather icon in the TopBar next to the city name. This gives at-a-glance weather without scrolling to the weather panel.

---

## Done when

- [ ] Weather cron fetches Open-Meteo data every 30 min and persists to Postgres
- [ ] `GET /api/berlin/weather` returns current + hourly + daily forecast
- [ ] WeatherPanel shows current conditions + 5-day forecast
- [ ] WMO weather codes are mapped to icons/labels
- [ ] TopBar shows current temperature
- [ ] DWD alerts show when active (for German cities)
- [ ] Bootstrap endpoint includes weather data
