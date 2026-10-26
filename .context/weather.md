# Weather System

## Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-weather.ts`) — Runs hourly. Routes per `city.dataSources.weather.provider`. For `'brightsky'` cities (today: Berlin, Hamburg), calls the adapter at `packages/server/src/lib/brightsky.ts`, which assembles `WeatherData` from BrightSky's `/current_weather` + `/weather` (7-day range) endpoints. For German cities, additionally fetches DWD severe-weather alerts and DWD UV index directly. Air quality is fetched alongside from Open-Meteo's separate `air-quality-api.open-meteo.com` host (not affected by the per-IP forecast quota). Writes to cache key `{cityId}:weather` (TTL 3600s) and persists to Postgres if DB connected.

   If a city's `provider` has no adapter, the cron logs a warning and skips that city — DE cities continue to update normally. See "Adding a non-German city" below.

2. **API** (`packages/server/src/routes/weather.ts`) — `GET /api/:city/weather` returns cached data, falls back to Postgres, then to an empty structure.

3. **Frontend** — the dashboard tile `packages/web/src/components/strips/WeatherStrip.tsx` and the top-bar popover `packages/web/src/components/layout/WeatherPopover.tsx`. Both use `useWeather()` (refetch 15 min) and render current conditions via WMO weather code → emoji/label (`packages/web/src/lib/weather-codes.ts`). Both show today's DWD UV index in the conditions row through `components/UvIndexToday.tsx` (see "DWD UV index" below).

## Data Sources

### BrightSky (German cities)

- **Endpoints**: `https://api.brightsky.dev/current_weather`, `/weather`, `/alerts`
- **Auth**: None
- **Rate limit**: No documented per-IP enforcement (public instance handles 2M+ req/day). Replaced Open-Meteo specifically because Render's shared egress IP exhausts Open-Meteo's 10k/day per-IP quota.
- **Source data**: DWD station observations + MOSMIX forecast model — same primary source DWD itself uses.
- **Adapter responsibilities** (in `lib/brightsky.ts`):
  - `iconToWmoCode(icon)` — maps BrightSky's icon enum (`clear-day`, `partly-cloudy-day`, `cloudy`, `fog`, `wind`, `rain`, `snow`, `sleet`, `hail`, `thunderstorm`, plus night variants) to a representative WMO code present in `weather-codes.ts`. Throws on unknown icons to surface upstream enum changes loudly.
  - `apparentTemp(temp, humidity, windKmh)` — Steadman formula. BrightSky doesn't provide apparent temperature; we compute it from `temperature` + `relative_humidity` + `wind_speed_10`.
  - `rollUpDaily(hourly, lat, lon, timezone)` — BrightSky has no daily-aggregate endpoint. Buckets hourlies by **local date** (per `city.timezone`, not UTC), computes `high`/`low`/`precip`, picks the icon at the entry closest to 12:00 local. Sunrise/sunset come from `suncalc` (MIT, no API call); emitted as UTC ISO strings.

### DWD severe weather alerts (German cities)

- **Endpoint**: `https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json` (JSONP-wrapped)
- Direct call inside `ingest-weather.ts:fetchDwdAlerts`. Filters by `regionName.includes(city.name)`; severity ≥ 2 only. Could be replaced with BrightSky's cleaner JSON `/alerts` endpoint as a follow-up.

### DWD UV index (German cities)

- **Endpoint**: `https://opendata.dwd.de/climate_environment/health/alerts/uvi.json` (no auth). One file for many German cities, updated once a day in the morning.
- **Format**: `{ forecast_day: "YYYY-MM-DD", last_update, next_update, content: [{ city: "Berlin", forecast: { today, tomorrow, dayafter_to } }] }`. Each value is the expected daily maximum UV index (whole numbers). The test fixture in `ingest-weather.test.ts` follows this shape; `npm run check:weather` prints the live `forecast_day` and values.
- **Parsing**: `parseDwdUv(json, city.name)` in `ingest-weather.ts` matches the city by name (case-insensitive) and returns `{ today, tomorrow, dayAfter, forecastDay }`, or null when the city is missing or a value is not a non-negative number. `forecastDay` comes from `forecast_day`, falling back to the date of `last_update`, and is left out when neither has one.
- **Storage**: `data.dwdUv` in the cache and in the weather snapshot (`saveWeather`). `WeatherDataSchema` keeps it on DB reads; a malformed `dwdUv` is dropped without failing the weather read. Snapshots written before 2026-10 have no `dwdUv`.
- **Display**: `uvIndexForToday()` (`packages/web/src/lib/uv-levels.ts`) picks today's value in the city's time zone: `today` on `forecastDay`, `tomorrow` the day after (before DWD's next morning update), `dayAfter` the day after that, and nothing later. `UvIndexToday` renders it as "UV max 4 ● Moderate": the label `panel.weather.uvMax` (it says "max" because the row's humidity and wind are current readings), value, WHO colour dot (`getUvLevel`) and the translated level (`panel.weather.uvLevel.*`), with `panel.weather.uvTodayHint` as tooltip. Hidden for cities without DWD data.
- Per-hour and per-day UV from the old Open-Meteo path are no longer populated post-migration.

### Air quality (all cities)

- **Endpoint**: `https://air-quality-api.open-meteo.com/v1/air-quality`
- This is a separate Open-Meteo host with its own quota; still working today. Migrating off Open-Meteo for AQ is a future decision if the same shared-IP issue manifests here.
- **Upstream data and attribution**: Open-Meteo serves the CAMS European air quality forecast (Copernicus Atmosphere Monitoring Service, ENSEMBLE data) and computes the European AQI from it. Open-Meteo asks users to credit both itself and the CAMS data provider, and the Copernicus licence asks for the notice "Contains modified Copernicus Atmosphere Monitoring Service information [year]" plus a statement that neither the European Commission nor ECMWF is responsible for its use. Both credits are on the Sources page (`packages/web/src/pages/SourcesPage.tsx`); keep them there while this endpoint is in use.

## Key Types

`WeatherData` (in `@city-monitor/shared`) — the contract:

```typescript
interface WeatherData {
  current: CurrentWeather;   // temp, feelsLike (Steadman), humidity, precipitation, weatherCode, windSpeed, windDirection
  hourly: HourlyForecast[];  // time, temp, precipProb (null→0), weatherCode
  daily: DailyForecast[];    // date (local), high, low, weatherCode, precip, sunrise, sunset (UTC ISO)
  alerts: WeatherAlert[];    // populated by DWD direct call for German cities
  dwdUv?: DwdUvForecast;     // today, tomorrow, dayAfter, forecastDay? (German cities only)
}
```

Optional fields `current.uvIndex`, `current.uvIndexClearSky`, `hourly[].uvIndex`, `daily[].uvIndexMax`, `daily[].uvIndexClearSkyMax` are no longer populated post-migration (BrightSky doesn't expose UV). The conditions row reads `dwdUv` instead; the hourly and daily UV cells in the tile and popover still read the old fields and stay empty.

## DB Schema

Snapshot type `'open-meteo'` in `snapshots.type` is a **historical opaque key** retained to avoid a Drizzle migration touching 6 reference sites (`schema.ts` enum + `reads.ts` × 2 + `writes.ts` + `app.ts:110` freshness + `data-retention.ts`). The data inside is now BrightSky-sourced. Renaming is a follow-up.

## Diagnostics

When weather appears stale in production, run `npm run check:weather` (from `packages/server/`) to probe all upstreams (BrightSky × 3, Open-Meteo air-quality, DWD warnings, DWD UV) end-to-end. Exits 0 if all return 200 + the expected shape, 1 if any fail. Add `-- --city hamburg` for Hamburg.

## Adding a non-German city

Today only `'brightsky'` is implemented in the adapter dispatcher. To add e.g. London:

1. Add the city config (`packages/server/src/config/cities/london.ts`) with `dataSources.weather.provider: 'weatherapi'` (or another global provider you add to the literal union in `shared/types.ts`).
2. Implement an adapter `packages/server/src/lib/weatherapi.ts` exporting `fetchWeatherApiForecast(city: CityConfig): Promise<WeatherData>`. Mirror the BrightSky adapter shape: HTTP fetches, transforms to the same `WeatherData` contract, computes `feelsLike` if the upstream doesn't provide it, throws on non-OK.
3. Add a branch in `ingest-weather.ts:createWeatherIngestion` for the new provider value.

**Recommended provider for global coverage**: [WeatherAPI.com](https://www.weatherapi.com/pricing.aspx) — free 100k calls/month, **per-account API key** (not per-IP, so Render's shared egress is not an issue), includes current + forecast + AQ + alerts. The API key goes in `process.env.WEATHERAPI_KEY`. The check script (`check-weather-sources.ts`) should grow corresponding probes for any new provider.

Until an adapter is added, the cron logs `no weather adapter for provider 'X' — see .context/weather.md to add one` once per cron run for that city and continues with other cities. DE cities are unaffected.
