# Water Levels

## Data Source

**PEGELONLINE** — German federal water level API (WSV). Free, no auth, DL-DE-Zero license.

- Base URL: `https://www.pegelonline.wsv.de/webservices/rest-api/v2`
- Batch fetch: `GET /stations.json?ids={uuids}&includeTimeseries=true&includeCurrentMeasurement=true&includeCharacteristicValues=true`
- Update frequency: every 15 minutes
- Characteristic values: MNW/MW/MHW for non-tidal, MTnw/MThw for tidal stations

## City Config

Water level stations are configured per city in `packages/server/src/config/cities/`:

- **Berlin** — 5 stations: Muhlendamm, Charlottenburg, Kopenick (Spree), Spandau (Havel), Schmockwitz (Dahme)
- **Hamburg** — 3 tidal Elbe stations: St. Pauli, Bunthaus, Seemannshoft

Config shape: `waterLevels.stations[].{ uuid, name, waterBody, tidal? }` in `CityDataSources`.

## State Derivation

The cron job (`ingest-water-levels.ts`) maps API data to a state enum:

1. If `currentLevel > MHW` (or MThw for tidal) → `very_high`
2. Otherwise, map API's `stateMnwMhw` field: `low` → `low`, `normal` → `normal`, `high` → `high`, anything else → `unknown`

## Server Pipeline

1. **Cron** (`*/15 * * * *`): `createWaterLevelIngestion(cache, db)` fetches PEGELONLINE batch API, derives state, writes to cache (key: `{cityId}:water-levels`, TTL: 900s) then DB
2. **DB**: `waterLevelSnapshots` table (cityId, stations JSONB, fetchedAt). Full-refresh writes (delete + insert in transaction). 7-day retention
3. **Route** (`GET /api/:city/water-levels`): Three-tier read (cache → DB → empty `{ stations: [], fetchedAt: null }`). 300s Cache-Control
4. **Bootstrap**: Included in `GET /api/:city/bootstrap` response as `waterLevels` field

## Shared Types (`shared/types.ts`)

- `WaterLevelStation` — uuid, name, waterBody, lat, lon, currentLevel, timestamp, state (`low`|`normal`|`high`|`very_high`|`unknown`), tidal, characteristicValues
- `WaterLevelData` — stations array + fetchedAt

## Frontend

- **Hook**: `useWaterLevels(cityId)` — 15-min refetch, 5-min stale, bootstrap-seeded
- **Dashboard tile**: `WaterLevelStrip` — gauge bars showing current level within MNW-MHW range, color-coded by state (blue=low, green=normal, amber=high, red=very_high, gray=unknown), tidal badge
- **Map markers**: Droplets icon colored by state, label showing current level in cm, popup with name/waterBody/level/state
- **Sidebar toggle**: `water-levels` layer in DataLayerToggles with Droplets icon
- **i18n**: Keys under `panel.waterLevels.*` and `sidebar.layers.water-levels` in all 4 languages

## Tests

- `ingest-water-levels.test.ts` — 7 unit tests covering fetch, transformation, state mapping, API failure, URL construction, config name usage
- `water-levels.test.ts` — 3 route tests covering empty cache, cached data, unknown city
