# Pollen Forecast

DWD Pollenflug-Gefahrenindex data showing 3-day pollen forecasts for 8 types. Both Berlin and Hamburg.

## Data Source

- **Provider:** DWD (Deutscher Wetterdienst)
- **URL:** `https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json`
- **Format:** Single JSON file with all German regions
- **License:** CC BY 4.0
- **Update frequency:** Daily (DWD publishes once per day)
- **Cron:** Every 6 hours (`0 */6 * * *`)

## Region Mapping

- **Berlin:** `region_id: 50, partregion_id: -1` (Brandenburg und Berlin — no sub-regions)
- **Hamburg:** `region_id: 10, partregion_id: 12` (Geest, Schleswig-Holstein und Hamburg)

City config: `dataSources.pollen: { provider: 'dwd', regionId, partregionId }`

## Data Shape

8 pollen types: Hasel, Erle, Esche, Birke, Graeser, Roggen, Beifuss, Ambrosia.

Intensity scale (string values): `'0'` (none), `'0-1'`, `'1'` (low), `'1-2'`, `'2'` (moderate), `'2-3'`, `'3'` (high), `'-1'` (off-season).

Each type has `today`, `tomorrow`, `dayAfterTomorrow` forecasts. DWD JSON uses `dayafter_to` for the third day (mapped to `dayAfterTomorrow` in our types).

**Seasonality:** Roughly Jan–Oct. In winter, all values return `'-1'`. The UI shows an off-season message.

## Architecture

Standard data source pattern:
- **Cron:** `ingest-pollen.ts` — single fetch, iterates active cities with pollen config
- **Parser:** `parseDwdPollenJson()` — exported pure function, testable
- **DB:** `pollen_snapshots` table (JSONB `data` column)
- **Route:** `GET /:city/pollen` — 3-tier read (cache → DB → null)
- **Bootstrap:** Included (small payload)
- **Warm cache:** Shared section (not Berlin-only)
- **Retention:** Moderate (7 days)

## Frontend

- **Hook:** `usePollen.ts` — 1h refetch, 30min stale
- **Component:** `PollenStrip.tsx` — expandable tile after Air Quality
  - **Collapsed:** Active pollen type badges with intensity colors
  - **Expanded:** 8-row × 3-column forecast table (today/tomorrow/dayAfter)
  - **Off-season:** Centered gray message
- **Freshness:** 26h max age (accounts for daily DWD update + 6h cron buffer)

## Key Files

- `shared/types.ts` — `PollenIntensity`, `PollenType`, `PollenTypeForecast`, `PollenForecast`
- `shared/schemas.ts` — `PollenForecastSchema`
- `packages/server/src/cron/ingest-pollen.ts`
- `packages/server/src/cron/ingest-pollen.test.ts` (10 tests)
- `packages/server/src/routes/pollen.ts`
- `packages/web/src/hooks/usePollen.ts`
- `packages/web/src/components/strips/PollenStrip.tsx`
