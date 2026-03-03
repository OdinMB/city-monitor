# Water

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
2. **DB**: `waterLevelSnapshots` table (cityId, stations JSONB, fetchedAt). Full-refresh writes (delete + insert in transaction). 30-day retention (extended for trend charts)
3. **Route** (`GET /api/:city/water-levels`): Three-tier read (cache → DB → empty `{ stations: [], fetchedAt: null }`). 300s Cache-Control
4. **Bootstrap**: Included in `GET /api/:city/bootstrap` response as `waterLevels` field

## Shared Types (`shared/types.ts`)

- `WaterLevelStation` — uuid, name, waterBody, lat, lon, currentLevel, timestamp, state (`low`|`normal`|`high`|`very_high`|`unknown`), tidal, characteristicValues
- `WaterLevelData` — stations array + fetchedAt

## Frontend

- **Hook**: `useWaterLevels(cityId)` — 15-min refetch, 5-min stale, bootstrap-seeded
- **Dashboard tile**: `WaterLevelStrip` — gauge bars showing current level within MNW-MHW range, color-coded by state (blue=low, green=normal, amber=high, red=very_high, gray=unknown), tidal badge. Expandable — shows 7-day avg water level TrendChart when expanded
- **History endpoint**: `GET /api/:city/water-levels/history?range=Nd` — returns `HistoryPoint[]` (avg level across stations). Max 30d. Lazy-loaded via `useWaterLevelHistory` hook when tile is expanded
- **Map markers**: Droplets icon colored by state, label showing current level in cm, popup with name/waterBody/level/state
- **Sidebar toggle**: `water` parent layer with sub-layers `levels` and `bathing` (same pattern as emergencies with pharmacies/AEDs)
- **i18n**: Keys under `panel.waterLevels.*`, `sidebar.layers.water`, and `sidebar.water.*` in all 4 languages

## Tests

- `ingest-water-levels.test.ts` — 7 unit tests covering fetch, transformation, state mapping, API failure, URL construction, config name usage
- `water-levels.test.ts` — 3 route tests covering empty cache, cached data, unknown city

---

# Bathing Water Quality

## Data Source

**LAGeSo** (Berlin State Office for Health and Social Affairs) — public CSV with no auth required.

- CSV URL: `https://data.lageso.de/baden/0_letzte/letzte.csv`
- Semicolon-delimited, 32 columns per row, German date format (DD.MM.YYYY)
- ~39 bathing spots in Berlin with coordinates, quality ratings, water temperature, visibility, algae warnings, EU classification
- Quality mapping: `Farb_ID` column — 1/11→good, 3/13→warning, 5→poor (11/13 are forecast variants from early warning system)

## Server Pipeline

1. **Cron** (`0 6 * * *`, daily at 6 AM): `createBathingIngestion(cache)` fetches CSV, parses to `BathingSpot[]`, writes to cache (key: `{cityId}:bathing:spots`, TTL: 86400s/24h). Cache-only, no DB table
2. **Route** (`GET /api/:city/bathing`): Cache read, empty array fallback. 12h Cache-Control
3. **Season flag**: `inSeason` boolean computed server-side (May 15 – Sep 15). Data available year-round but UI shows off-season badge

## Shared Types (`shared/types.ts`)

- `BathingSpot` — id, name, district, waterBody, lat, lon, measuredAt, waterTemp, visibility, quality (`good`|`warning`|`poor`), algae, advisory, classification, detailUrl, inSeason

## Frontend

- **Hook**: `useBathing(cityId)` — 24h refetch, 12h stale
- **Map markers**: Waves icon colored by quality (green=good, amber=warning, red=poor), popup with name, water body, district, quality badge, temp, visibility, algae warning, advisory, off-season badge, LAGeSo detail link. HTML-escaped popup content
- **Sidebar toggle**: `bathing` sub-layer under the `water` parent layer
- **i18n**: Keys under `sidebar.water.bathing` in all 4 languages

## Tests

- `ingest-bathing.test.ts` — 12 unit tests covering CSV parsing, field mapping, quality mapping, null handling, `<` prefix parsing, fetch failure, empty CSV, TTL, inSeason, coordinate filtering, German date parsing
- `bathing.test.ts` — 3 route tests covering empty cache, cached data, unknown city
