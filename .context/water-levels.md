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
- **Köln** — 1 Rhein station: Köln (Rhein-km 688)
- **München** — none: the Isar is a Bavarian water, not a federal waterway, so PEGELONLINE has no gauge in the city and `waterLevels` is left out (no `waterLevels` feature). Its flood class comes from the LHP instead ([Flood Status](#flood-status-lhp) below).

Config shape: `waterLevels.stations[].{ uuid, name, waterBody, tidal? }` in `CityDataSources`.

## State Derivation

The cron job (`ingest-water-levels.ts`) maps API data to a state enum:

1. If `currentLevel > MHW` (or MThw for tidal) → `very_high`
2. Otherwise, map API's `stateMnwMhw` field: `low` → `low`, `normal` → `normal`, `high` → `high`, anything else → `unknown`

PEGELONLINE answers `stateMnwMhw: "unknown"` for tidal gauges, and the Elbe gauges Bunthaus and Seemannshöft have no characteristic values at all, so their state is always `unknown` (St. Pauli is `unknown` too unless it is above MThw). The frontend shows an `unknown` gauge's level on its own: no state badge in the tile, no state line in the popup, the figure in the plain text colour, and a neutral grey map badge. "Unknown" would read as a fault rather than "no reference values".

## Server Pipeline

1. **Cron** (`*/15 * * * *`): `createWaterLevelIngestion(cache, db)` fetches PEGELONLINE batch API, derives state, writes to cache (key: `{cityId}:water-levels`, TTL: 900s) then DB
2. **DB**: Unified `snapshots` table, type `pegelonline` (data JSONB contains `{ stations }`). 30-day retention (`HISTORY_RETENTION`, kept for the history endpoint)
3. **Route** (`GET /api/:city/water-levels`): Three-tier read (cache → DB → empty `{ stations: [], fetchedAt: null }`). 300s Cache-Control
4. **Bootstrap**: Included in `GET /api/:city/bootstrap` response as `waterLevels` field

## Shared Types (`shared/types.ts`)

- `WaterLevelStation` — uuid, name, waterBody, lat, lon, currentLevel, timestamp, state (`low`|`normal`|`high`|`very_high`|`unknown`), tidal, characteristicValues
- `WaterLevelData` — stations array + fetchedAt

## Frontend

- **Hook**: `useWaterLevels(cityId)` — 15-min refetch, 5-min stale, bootstrap-seeded
- **Dashboard tile**: `WaterLevelStrip` — gauge bars showing current level within MNW-MHW range, color-coded by state (blue=low, green=normal, amber=high, red=very_high; an unknown state gets no badge), tidal badge. Not expandable, no trend chart (last tile of the grid)
- **History endpoint**: `GET /api/:city/water-levels/history?range=Nd` — returns `HistoryPoint[]` (avg level across stations), cached 900s. Default 7d, max 30d. The `useWaterLevelHistory` hook exists but no component calls it
- **Map markers**: Droplets icon colored by state, label showing current level in cm, popup with name/waterBody/level/state
- **Sidebar toggle**: `water` parent layer with sub-layers `levels` and `bathing` (same pattern as emergencies with pharmacies/AEDs)
- **i18n**: Keys under `panel.waterLevels.*`, `sidebar.layers.water`, and `sidebar.water.*` in all 4 languages

## Tests

- `ingest-water-levels.test.ts` — 7 unit tests covering fetch, transformation, state mapping, API failure, URL construction, config name usage
- `water-levels.test.ts` — 3 route tests covering empty cache, cached data, unknown city

---

# Bathing Water Quality

## Data Sources

A city has bathing spots when its server config sets `dataSources.bathing`, a provider-tagged `BathingSource` (same pattern as `dataSources.roadworks`). Each provider has its own parser in `cron/ingest-bathing.ts` and writes the shared `BathingSpot`. The snapshot type stays `lageso-bathing` for every provider.

| City | Provider | Source |
|---|---|---|
| Berlin | `lageso` | LAGeSo CSV |
| Hamburg | `hamburg-wfs` | Geodienste `HH_WFS_Badegewaesser` (dl-de/by-2.0, credit "Freie und Hansestadt Hamburg, Behörde für Umwelt und Energie") |

Köln and München have none (see `cities.md`).

### Berlin: LAGeSo

**LAGeSo** (Berlin State Office for Health and Social Affairs) — public CSV with no auth required.

- CSV URL: `https://data.lageso.de/baden/0_letzte/letzte.csv`
- Semicolon-delimited, 32 columns per row, German date format (DD.MM.YYYY)
- ~39 bathing spots in Berlin with coordinates, quality ratings, water temperature, visibility, algae warnings, EU classification
- Quality mapping: `Farb_ID` column — 1/11→good, 3/13→warning, 5→poor (11/13 are forecast variants from early warning system)

### Hamburg: Geodienste WFS

Two GeoJSON requests to the WFS (`typeNames=badegewaesser` for the ~17 spots, `badegewaesser_proben` for every sample of the season, ~130), both `srsName=EPSG:4326`. Both must succeed, otherwise the previous data stays.

- **Join:** each spot takes its newest sample with the same `name` (`datum` is `YYYYMMDD`); temperature and visibility come from the sample (`n.g.` → null).
- **Quality** (Hamburg has no colour code, so it is derived): `poor` when the spot is closed (`badesaison` `gesperrt`, icon `baden_verboten`, or "Baden verboten" in the remark); `warning` when the remark says "Warnung" or the sample has `algen` `viel`; otherwise `good`. The newest sample's remark wins over the spot layer's, which sometimes lags.
- **Advisory:** "Badestelle gesperrt" when closed, else the remark unless it is plain "keine Beanstandung". `algae` is "Algen: viel" or null.
- **Not mapped:** `classification` stays null, as the `eg_einstufung` codes are undocumented; `district` is empty; `waterBody` is the name before its comma.
- **Season:** each spot states its own season ("DD.MM.YYYY bis DD.MM.YYYY"); `inSeason` uses it, and falls back to the shared 15 May – 15 Sep window.
- **Detail link:** the spot's `link`, upgraded to https.

## Server Pipeline

1. **Cron** (`0 6 * * *`, daily at 6 AM): `createBathingIngestion(cache, db)` runs every active city with `dataSources.bathing` through its provider's parser, writes to cache (key: `{city}:bathing:spots`, TTL: 86400s/24h) then DB via `saveBathingSpots` (unified `snapshots` table, type `lageso-bathing`, 2-day retention plus the 100-row cap). A failed city keeps its previous data and does not stop the others
2. **Route** (`GET /api/:city/bathing`): Three-tier read (cache → DB → empty array). 12h Cache-Control
3. **Season flag**: `inSeason` boolean computed server-side. Data available year-round but UI shows off-season badge; the tile goes off-season when no spot is in season

## Shared Types (`shared/types.ts`)

- `BathingSpot` — id, name, district, waterBody, lat, lon, measuredAt, waterTemp, visibility, quality (`good`|`warning`|`poor`), algae, advisory, classification, detailUrl, inSeason

## Frontend

- **Hook**: `useBathing(cityId)` — 24h refetch, 12h stale
- **Map markers**: Waves icon colored by quality (green=good, amber=warning, red=poor), popup with name, water body, district, quality badge, temp, visibility, algae warning, advisory, off-season badge, detail link named after its source (LAGeSo, else the link's host). Empty water body or district is left out. HTML-escaped popup content
- **Sidebar toggle**: `bathing` sub-layer under the `water` parent layer
- **i18n**: Keys under `sidebar.water.bathing` in all 4 languages

## Tests

- `ingest-bathing.test.ts` — unit tests covering CSV parsing, field mapping, quality mapping, null handling, `<` prefix parsing, fetch failure, empty CSV, TTL, inSeason, coordinate filtering, German date parsing, the per-city providers, a failed Hamburg request, and `parseHamburgBathing` on recorded, trimmed WFS responses (`fixtures/hh-badegewaesser*.json`, 2026-11-02)
- `bathing.test.ts` — 3 route tests covering empty cache, cached data, unknown city

---

# Flood Status (LHP)

A dashboard tile of its own (not a map sub-layer) for rivers PEGELONLINE lacks: today the Isar in München. It shows each configured gauge's flood class in words, with the state's own label (Meldestufe) above class 0, active flood warnings for the city, and the credit and "Stand" the licence asks for.

## Data Source

**LHP public API** (Länderübergreifendes Hochwasserportal, run by the federal states; docs at https://www.hochwasserzentralen.de/developers/, OpenAPI `developers/docs/lhp-public-api_v1.20240123.yaml`, version "1.0 beta, 2025-02-04"). No key, no auth.

- `GET https://api.hochwasserzentralen.de/public/v1/data/stations?states=BY` with `Accept: application/json` — every LHP flood gauge of the state (243 for BY, 72 KB): `id` (`BY_<HND number>`), `coordinates`, `lhpClass`, `stateClassName`, `timestamp` (German local time, no offset), `stationLink`. Top-level `updated` is the "Stand".
- `GET …/data/alerts?states=BY` with `Accept: application/geo+json` — active warning areas as GeoJSON `features` (the JSON format calls the list `data`): `areaDesc`, `areaType` (Region or river section), `alertHeadline`, `alertLink`, `lhpClass` (a string), `lhpClassName`, and the area's geometry.
- **Gauge classes** (`lhpClass`): -1 no current data, 0 no flood, 1–4 minor to very severe flood. Each state maps its own levels onto them; in Bavaria class N is Meldestufe N (LHP's `webservices/get_infoseite.php`, the table on its "Hinweise" page). **Warning classes**: 1 all-clear, 2 pre-warning, 4 flood, 5 severe, 6 very severe.
- **No water levels or discharge**: "Nicht bereitgestellt werden Messwerte wie Wasserstand oder Abfluss." Isar levels in cm would need the LfU's permission (HND pages are for private use; the GKD downloads are CC BY 4.0 but have no API) or the announced HND API. Do not scrape either.
- **ETag**: the API sends one and answers `If-None-Match`, but the data changes every minute, so a 5-minute poll never gets a 304; the job does not send it.
- Node's fetch and curl both reached `api.hochwasserzentralen.de` from the dev container on 2026-11-01.

### Terms (CC BY 4.0, developers page)

- Show "Datenquelle: www.hochwasserzentralen.de" as a clickable link, and the data's `updated` as "Stand: TT.MM.JJJJ hh:mm", both clearly visible. The tile's footer does: the credit word for word in every UI language, the Stand label translated, the time always in German time and that format.
- Republished data should be refreshed at least every 10 minutes: job `*/5`, route max-age 120 s, hook refetch 3 min, so an open tab shows data at most about 10 minutes past LHP's Stand while the job runs. The DB fallback refuses rows older than 30 minutes.
- Use LHP's class colours where possible: the tile's dot uses them (fixed in `FloodStatusStrip.tsx`, not taken from the response), next to the class in words.
- Unchecked raw data, no warranty; the states are responsible for the content (said on the Sources page).

## City Config

`dataSources.floodStatus: { provider: 'lhp', state, stations: [{ id, name, waterBody, upstream? }] }`. Another Bavarian city needs only this entry (gauge ids from the stations response) plus `floodStatus` in its web `features`; a city in another state sets that state's code.

- **München** — `state: 'BY'`; `BY_16005701` München (HND 16005701, Meldestufen at 240/300/380 cm and a 4th) and `BY_16004403` Puppling, the last gauge upstream (~25 km south), marked upstream. Further LHP Isar gauges: Sylvenstein, Lenggries, Bad Tölz Brücke (upstream), Freising, Landshut Birket, Landau, Plattling (downstream).

## Server Pipeline

1. **Cron** `ingest-flood-status` (`*/5 * * * *`): one stations and one alerts request per state, shared by its cities. Both must succeed and report `status: success`, else the city's previous status stays (a missing warnings answer must not read as "no warnings"). Writes cache key `{cityId}:flood-status` (TTL 600 s) and snapshot type `lhp-flood` (2 days + row cap).
2. **Warnings for the city** (`alertConcernsCity`): a warned region (Polygon/MultiPolygon) that contains the city centre or one of its own, not upstream, gauges; a river section given as a line or point with a vertex in the city's bounding box; with no geometry, an area whose name contains the city's. Sorted by class, highest first, geometry dropped.
3. **Gauges**: in config order. A gauge with class -1, or missing from LHP (logged as a warning), has `floodClass: null` and shows "No current data". `measuredAt` is the station timestamp with the German offset added.
4. **Route** `GET /api/:city/flood-status`: cache → DB (30 min max age) → `{ data: null, fetchedAt: null }`. Cache-Control 120 s. Also the bootstrap slot `floodStatus`.

## Shared Types

`FloodStatus { gauges: FloodGauge[]; alerts: FloodAlert[]; updated }`, `FloodGauge { id, name, waterBody, upstream, floodClass: 0–4 | null, stateLabel, measuredAt, url }`, `FloodAlert { id, headline, area, level, levelName, url }`; Zod `FloodStatusSchema`.

## Frontend

- **Feature** `floodStatus` (server `city-features.ts`, web München config); **hook** `useFloodStatus` (3-min refetch, bootstrap-seeded); **tile** `FloodStatusStrip` after the water-level tile; freshness row `floodStatus`; i18n `panel.floodStatus.*` in all four bundles. The class names follow LHP's legend (minor/moderate/major/severe flood; German: Kleines … Sehr großes Hochwasser).
- **Sources page**: München's Water group, "Source: Länderübergreifendes Hochwasserportal (LHP), CC BY 4.0."

## Tests

- `ingest-flood-status.test.ts` — parsers against a recorded, trimmed stations response (`cron/fixtures/lhp-stations-by.json`) and the recorded empty alerts response; warnings in the OpenAPI example's shape with made-up areas (none was active to record); city matching (centre, gauge, Landkreis hole, river line, name fallback); the job's URLs and headers, keeping the old status on a failed warnings request, no requests without a configured city.
- `flood-status.test.ts` — route and bootstrap slot.
- `FloodStatusStrip.test.tsx` — class words, Meldestufe, upstream badge, credit link and Stand in all four languages, warnings, unsafe link, no-data and empty states.
