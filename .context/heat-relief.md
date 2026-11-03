# Heat relief

A map layer of places that help in hot weather, in up to three sub-layers: cool places (Kühle Orte), drinking fountains and public toilets. One icon per kind (fan, glass, toilet); a fountain that is out of order or out of season is grey and drawn under the running ones. The popup shows the name (or, for a nameless cool place, its setting), address, opening hours, the fountain's season, fee, wheelchair access, changing table and the source's note, plus a directions link. The layer is in the sidebar all year. When DWD warns of heat, or its heat trend expects heat, the weather tile shows a hint that names the city's lists and turns the layer on. Added 2026-11-03.

| City | Cool places | Fountains | Toilets |
|---|---|---|---|
| Berlin | yes | yes (season, out of order) | yes |
| Köln | yes (three lists) | yes | yes |
| München | none found | yes | yes |
| Hamburg | none found | yes | none found |

## Sources (`dataSources.heatRelief`)

A list per city; each entry pairs a `kind` with a `provider` and its URL (`HeatReliefSource` in `shared/types.ts`). Request URLs and one parser per provider in `packages/server/src/lib/heat-relief-parsers.ts`; trimmed real samples in `lib/heat-relief-fixtures/`. Every licence checked on its catalogue entry on 2026-11-03.

| City | Kind | Provider | Service, layer | Licence, author |
|---|---|---|---|---|
| Berlin | cool | `berlin-cool-rooms` | `gdi.berlin.de/services/wfs/kuehle_raeume`, `kuehle_raeume:kuehle_raeume` | dl-de/zero-2.0, Senatsverwaltung für Wissenschaft, Gesundheit und Pflege |
| Berlin | fountain | `berlin-fountains` | `…/wfs/trinkwasserbrunnen`, `trinkwasserbrunnen:trinkwasserbrunnen` | dl-de/zero-2.0, Berliner Wasserbetriebe |
| Berlin | toilet | `berlin-toilets` | `…/wfs/toiletten`, `toiletten:toiletten` | dl-de/zero-2.0, SenMVKU |
| Hamburg | fountain | `hamburg-fountains` | `geodienste.hamburg.de/wfs_trinkwasserbrunnen`, `de.hh.up:trinkwasserbrunnen` | dl-de/by-2.0, BUKEA (Transparenzportal "trinkwasserbrunnen-hamburg7") |
| Köln | cool | `koeln-cool-places` | `geoportal.stadt-koeln.de/wss/service/kuehle_orte_wfs/guest`, `ms:im_innenraum`, `ms:klimatisierter_ort`, `ms:am_wasser` | dl-de/zero-2.0, Stadt Köln |
| Köln | fountain | `koeln-fountains` | `…/trinkwasserbrunnen_wfs/guest`, `ms:trinkwasserbrunnen` | dl-de/zero-2.0, Stadt Köln – Amt für Landschaftspflege und Grünflächen |
| Köln | toilet | `koeln-toilets` | `www.awbkoeln.de/geodaten/toiletten/` (XML) | dl-de/zero-2.0, AWB Köln |
| München | fountain | `muenchen-fountains` | `geoportal.muenchen.de/geoserver/baug_wfs/ows`, `baug_wfs:trinkwasserbrunnen` | dl-de/by-2.0, Baureferat |
| München | toilet | `muenchen-toilets` | `…/gsm_wfs/ows`, `gsm_wfs:wc_finder_opendata` | dl-de/by-2.0, GeodatenService (opendata.muenchen.de `wc_finder`) |

The two dl-de/by lists are credited on the Sources page as the licence asks ("Source: <provider>, dl-de/by-2-0."); the zero-licence lists name their publisher as a courtesy.

- **GDI Berlin, Hamburg, München:** WFS 2.0.0 GetFeature with `application/json` (Hamburg `application/geo+json`) in EPSG:4326.
- **Köln geoportal:** answers GeoJSON only to WFS 1.1.0 with `outputFormat=geojson`, and ignores `srsName`. The cool-place layers carry base64 photos, so `propertyName` asks for the description and `Koordinate_WGS84` alone; the first line of the description, if short, is the name. The fountains come in EPSG:25832 and are converted with `utm32ToLonLat` (`roadworks-parsers.ts`).
- **AWB Köln:** an XML list (fast-xml-parser); the fee is read from the "Nutzungsgebühr" phrase of the description.
- **München toilets:** one row per room (~323 rows); rows at the same coordinates (5 decimals) are merged into one place, with the highest fee, accessible if any room is "barrierefrei", out of order only if every room is "defekt". `propertyName` keeps 10 of ~90 columns.
- **Berlin fountains:** the season ("April bis Oktober") and "außer Betrieb" are read from the `informationen` text.

Live counts on 2026-11-03, inside the bounding box: Berlin 126 cool / 242 fountains / 525 toilets (~165 KB JSON), Hamburg 10 fountains, Köln 142 cool (73 indoor, 24 air-conditioned, 45 by the water) / 16 fountains / 179 toilets, München 115 fountains / 213 toilets.

## Pipeline

- `cron/ingest-heat-relief.ts`, weekly (Monday 05:30), and at startup when the stored row is stale. All lists of a city in one `heat-relief` snapshot (`HeatReliefData { places }`). A list that fails or comes back empty keeps that kind's places from the previous run; if no list could be read the cache is left alone. Places outside the city's `boundingBox` are dropped. Writes `CK.heatRelief(city)` (`{city}:heat-relief`, TTL 8 days).
- `FRESHNESS_SPECS` max age 7 days; `loadHeatRelief` takes any age (the lists change seldom). Retention: 7 days with `keepLatest`, so a run of failures never empties the layer.
- `GET /api/:city/heat-relief` → `{ data: HeatReliefData | null, fetchedAt }`, `Cache-Control: max-age=43200`, heavy-payload rate limit. Not in the bootstrap.
- Server features `coolPlaces`, `drinkingFountains`, `publicToilets` come from the config (`hasHeatRelief` in `lib/city-features.ts`); the web configs list the same (parity test).

## DWD heat signal

- **Warnings:** DWD warning levels 10 and 11 (strong and extreme heat stress) now carry `kind: 'heat'` on the `WeatherAlert` ([weather.md](weather.md)).
- **Heat trend:** `ingest-weather` reads `opendata.dwd.de/climate_environment/health/forecasts/heat/hwtrend_YYYYMMDD.json` (`lib/dwd-heat-trend.ts`; today's file, yesterday's on a 404) and keeps the city's warn region (`cityWarnRegions`) as `WeatherData.dwdHeatTrend { issued, days }`. One code per day for 8 days: 0 none, 1 strong-heat warning, 2 extreme-heat warning, 3 heat trend. CC BY 4.0, credited on the DWD card. All zeros in November.
- `heatSignal` (`packages/web/src/lib/heat-relief.ts`): `warning` while a heat warning is in force or the trend says 1 or 2 for today; `outlook` when it says anything above 0 within today and the next three days; else nothing.

## Frontend

- `DataLayer` `'heat-relief'` in the Environment category (off by default) with sub-layers `cool`, `fountains`, `toilets` (`heatReliefSubLayers`), gated by the three features (`lib/map-layers.ts`). A city with one list (Hamburg) shows no sub-layer buttons.
- `hooks/useHeatRelief.ts` fetches only while the layer is on (`staleTime` 6 h, no polling).
- `components/map/layers/heat-relief.ts`: one `symbol` layer (`heat-relief-icon`); `heatReliefPopupHtml` follows the UI language (`popup-language.test.ts`); feed text stays German in `sourceText` isolates.
- `components/HeatReliefHint.tsx` in the weather tile; its button calls `showHeatRelief()` (adds the layer, or replaces it in single view, and turns all sub-layers on) and scrolls up to the map.
- Synthetic data: places of each kind the city has near the anchors (`synthetic/generate.ts`).

## Not added

- **Hamburg cool places and toilets:** no open list found on the Transparenzportal (2026-11-03).
- **München cool places:** none published as open data (opendata.muenchen.de, 2026-11-03).
