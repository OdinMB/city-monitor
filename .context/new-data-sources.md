# Data Sources

## New Data Source Checklist

Follow every step when adding a new data source. Skip items marked with a surface qualifier (map/tile) if that surface doesn't apply.

### Server

1. **Shared types** — add data interfaces to `shared/types.ts`
2. **Cache keys** — add typed key(s) to `packages/server/src/lib/cache-keys.ts` (`CK.*`). If the data is small and should load instantly, add to `bootstrapKeys`. If large (>50KB), exclude and lazy-fetch.
3. **DB snapshot type** — add type to `SNAPSHOT_TYPES` in `packages/server/src/db/schema.ts` (all snapshots use the unified `snapshots` table)
4. **DB writes** — add save function to `packages/server/src/db/writes.ts`
5. **DB reads** — add load function to `packages/server/src/db/reads.ts`
6. **Cron job** — create `packages/server/src/cron/ingest-<name>.ts` with factory function. Loop over `getActiveCities()` and skip cities without the source's `dataSources` entry. A Berlin-only source with a hardcoded URL and no config entry instead returns first thing when `getCityConfig('berlin')` is undefined, and its job name goes into `BERLIN_ONLY_JOBS` in `app.ts`
7. **REST endpoint** — create `packages/server/src/routes/<name>.ts` with 3-tier read (cache → DB → null)
8. **App registration** — in `packages/server/src/app.ts`: import + instantiate cron, add `FRESHNESS_SPECS` entry (its `serves` predicate repeats the job's city filter from step 6; `inBerlin` for a Berlin-only source), register cron job with schedule, mount route with `cacheFor()`
9. **Cache warming** — add to `packages/server/src/db/warm-cache.ts` (in the Berlin-only block if Berlin-only)
10. **Bootstrap** (if included) — add field to bootstrap response in `packages/server/src/routes/bootstrap.ts` (its key must be in `CK.bootstrapKeys`, step 2)

### Frontend

11. **API client** — re-export types from `shared` and add `api.get*()` method in `packages/web/src/lib/api.ts`. If bootstrapped, extend `BootstrapData` in `shared/types.ts` (`api.ts` only re-exports it).
12. **Data hook** — create `packages/web/src/hooks/use<Name>.ts` (follow `useSocialAtlas` or `useLaborMarket` pattern)
13. **Bootstrap seeding** (if bootstrapped) — add `setQueryData` line in `packages/web/src/hooks/useBootstrap.ts`
14. **Zustand state** (map layer) — extend layer types in `packages/web/src/hooks/useCommandCenter.ts`
15. **Sidebar toggles** (map layer) — add sub-layer entry in `packages/web/src/components/sidebar/DataLayerToggles.tsx`
16. **Map rendering** (map layer) — add an `update*Layer()` / `update*Markers()` function (plus its popup HTML builder) in `packages/web/src/components/map/layers/<name>.ts`, then the reactive wiring in `packages/web/src/components/map/CityMap.tsx`
17. **Dashboard tile** (tile) — create strip component in `packages/web/src/components/strips/<Name>Strip.tsx`, mount in `packages/web/src/components/layout/CommandLayout.tsx`. If it shows freshness, add a row for its feed to `packages/web/src/lib/freshness.ts` and use `staleAfter()`
18. **i18n** — add translation keys in all 4 locale files (`en.json`, `de.json`, `tr.json`, `ar.json`)
19. **City feature** — add a `CityFeature` in `shared/types.ts`, its ingestion condition in `packages/server/src/lib/city-features.ts` (the same check the cron job makes), and the feature in the `features` list of each web city config that has the source. Gate the tile, map toggle, hook (`enabled`) and Sources credit on it (`.context/frontend.md`, "City Context"). The parity test in `packages/web/src/config/index.test.ts` fails until server and web agree.

### Favicons (if adding news feeds)

19. **Favicon slugs** — add source name → slug mapping to `FAVICON_SLUGS` in `packages/web/src/lib/news-favicons.ts` (its test fails until every configured feed has one) and slug → domain mapping to `FAVICON_SOURCES` in `packages/web/scripts/fetch-favicons.ts`. Run `npx tsx packages/web/scripts/fetch-favicons.ts` and commit the new PNGs from `packages/web/public/favicons/`.

### Documentation & Attribution

20. **Sources page** — add entry to `SHARED_SOURCES` or to the city's array in `CITY_SOURCES` (`BERLIN_SOURCES`, `HAMBURG_SOURCES`, `KOELN_SOURCES`) in `packages/web/src/pages/SourcesPage.tsx`: shared only if its job runs for every city, otherwise in each list of a city it runs for (a shared entry can be limited with `cities`). Where the job's condition is in the city config or `BERLIN_ONLY_JOBS`, add the credit and that condition to `CONFIG_DRIVEN` in `SourcesPage.test.tsx`, which checks each city's credits against its server config. Give the attribution its licence asks for (ODbL: "© <holder> contributors, ODbL."; CC BY or dl-de/by: "Source: <provider>, <licence>."), and add it to `LICENCE_CREDITS` in the same test. If the browser loads anything from the source's own host (a WMS layer, map tiles), also allow that host in the CSP in `render.yaml` and name it in `SERVICES` in `packages/web/src/pages/PrivacyPage.tsx`; `PrivacyPage.test.tsx` checks that the two agree.
21. **Context file** — create `.context/<name>.md` documenting the data source, ingestion pipeline, cache keys, endpoint shapes
22. **CLAUDE.md** — add a one-line reference to the new context file in the "Context Files" section
23. **Data freshness note** — if the source uses a hardcoded URL that changes periodically (XLSX files, biennial WFS layer names, budget CSVs), add an entry to the Data Freshness Inventory below with the check schedule

### Testing

24. **Unit tests** — test CSV/XLSX/JSON parsing logic with mock data, test summary aggregation, test edge cases (empty data, malformed rows)
25. **Integration test** — test REST endpoint with mock cache/DB
26. **Synthetic data** — add plausible, clearly fake data to `packages/server/src/synthetic/generate.ts`, with the cities it covers in `COVERED` there, and write it in `seed.ts` ([dev-database.md](dev-database.md)). `seed.test.ts` fails until every `SNAPSHOT_TYPES` entry is seeded.

### DB Migration (production)

27. **Generate migration** — `npm run db:generate` from `packages/server`
28. **Apply migration** — `npm run db:migrate` (or `db:push` in dev)

---

## Data Freshness Inventory

Sources with **hardcoded URLs or version-pinned data** that need periodic manual checks. Real-time APIs with stable endpoints (Open-Meteo, PEGELONLINE, VBB, etc.) are not listed — they self-update.

| Source | Current URL/Version | Update Cycle | When to Check | Notes |
|--------|-------------------|--------------|---------------|-------|
| **MSS Social Atlas** | WFS `mss_2025` (data as of 2024-12-31; switched 2026-11-01) | Biennial; the WFS follows the report by about a year (MSS 2025 WFS registered 2026-10) | Q3–Q4 of odd years (next: MSS 2027, from autumn 2027) | Each edition is its own service (`…/wfs/mss_<year>`). Update `wfsUrl` in `berlin.ts`; `mssLayerNames` derives the layer names from it. Compare the `indexind_542` fields (`s1`–`s4`, `ew`, `kom`) before switching. Search `datenregister.berlin.de` for "Monitoring Soziale Stadtentwicklung". |
| **Berlin Budget CSV** | `260223_doppelhaushalt_2026_2027.csv` (still the dataset's only CSV, checked 2026-11-01) | Biennial | When new Doppelhaushalt is published (next: 2028/2029, late 2027) | URL and filename change with each budget cycle. Update `csvUrl` in `berlin.ts`. The dataset is `doppelhaushalt-2026-2027-1642871` on `datenregister.berlin.de`. |
| **Berlin Rent Map WMS** | `wohnlagenadr2026` (Mietspiegel 2026; switched 2026-11-01) | With each Mietspiegel, every two years | Mid-year of even years (next: Mietspiegel 2028) | Service and layer are both named `wohnlagenadr<year>` in `RENT_MAP_WMS_URL` (`packages/web/src/components/map/constants.ts`). Search `datenregister.berlin.de` for "Wohnlagenkarte"; also update the Sources page entry. |
| **Berlin noise map WMS** | `ua_stratlaerm_2022` with `…_den2022` layers (`NOISE_WMS_*` in `map/constants.ts`) | EU round every 5 years | When the 2027 round appears (likely 2028) | Checked 2026-11-01: daten.berlin.de lists 2007–2022 only. A new round brings a new service and layer names, and the Sources page URL. |
| **LAGeSo Bathing CSV** | `data.lageso.de/baden/0_letzte/letzte.csv` | Seasonal (May–Sep) | Start of each bathing season | URL is stable but data stops updating in winter. |
| **abgeordnetenwatch** | API v2 | Per election cycle | After federal/state/local elections | The period is looked up on each run; Berlin's "Berlin 2026 - 2031" (id 176) has members and its Wahlkreise keep the "`<Bezirk> <n>`" names that `state-bezirke` needs (checked 2026-11-01). Constituency IDs and parliament IDs change with redistricting. Köln and München are filtered by constituency name (`constituencies` in `PARLIAMENT_CONFIG`, `ingest-political.ts`): re-check them after the next Bundestag election (due 2029), the next Landtag NRW election (May 2027) and the next Bavarian Landtag election (autumn 2028). A name no mandate stood in is logged as `no <parliament> mandate in …`; a level where none matches keeps its old data. |
| **Population XLSX (EWR)** | `SB_A01-16-00_2026h01_BE.xlsx` (switched 2026-11-01) | Semi-annual (h01=Jun, h02=Dec) | Q1 and Q3–Q4 each year (published ~3 months after snapshot; next: 2026h02, from about March 2027) | URL contains hash segments that change per edition: copy it from `statistik-berlin-brandenburg.de/a-i-16-hj`. Update the hardcoded URL in `ingest-population.ts` and its test. |
| **Crisis-service numbers** | Hand-kept directory per city in `packages/web/src/components/strips/crisis-services.ts` (Berlin, Hamburg, Köln, München) | Irregular | Once a year, each November (last: Berlin 2026-10-27, others 2026-11-01) | Re-check every number, name and hours on the entry's official page (its `url`), then set the city's `checkedOn`, which the tile's footer shows. Hamburg's Krisentelefon and Köln's Sozialpsychiatrischer Dienst have limited hours, kept in the `panel.crisis.note.*` strings in all four bundles. A new city gets the tile only with a directory there and `crisis` in its web `features` (`config/index.test.ts` checks both). |
| **München roadworks filter** | CQL on `art` and `beeintraechtigung` (`MUENCHEN_CQL_FILTER` in `lib/roadworks-parsers.ts`) | Daily data, free-text values | Twice a year, or when the München site count drops sharply | The filter matches words in a free-text field; ~870 of ~5,600 features matched in 2026-11. See [roadworks.md](roadworks.md). |
| **Köln roadworks layers** | 10 layer names in `koeln.ts` (`strassenbauarbeiten` …) | Unannounced | When `ingest-construction` logs a Köln failure | A renamed or removed layer fails the whole Köln run (by design, so no kind of works silently vanishes). |
| **München RIS RSS** | `risi.muenchen.de/risi/rss?feed=StR-Sitzungen` / `BA-Sitzungen` | Unversioned, scraped title format | Q1 each year, and whenever München's council tile goes empty | No API: the RSS is the RIS front end's own feed. A new RIS or a changed title wording ("… am Donnerstag, 12. November 2026, 19:30 Uhr") makes `parseRisTitle` skip every item. `MUENCHEN_BEZIRKE` in `ingest-council-meetings.ts` maps BA numbers to Stadtbezirk names. |
| **Köln SessionNet OParl** | `buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/meetings` | Per vendor update | Q1 each year | Host and body id are SOMACOS-specific; the other host (`ratsinformation.stadt-koeln.de/oparl`) resets connections. `webUrlPrefix` (`si0057.asp?__ksinr=`) is SessionNet's page pattern, not part of OParl. |
| **LHP flood status** | `api.hochwasserzentralen.de/public/v1` ("1.0 beta, 2025-02-04"); München gauges `BY_16005701`, `BY_16004403` in `muenchen.ts` | Beta API, changelog on the developers page | Q1 each year, and when a gauge shows "No current data" for long or `ingest-flood-status` logs failures | Check the changelog (CAP alerts and SVG were announced) and the terms (credit, Stand, 10-minute refresh). Also check whether the announced HND API has appeared: Isar levels in cm are out of scope until it does or the LfU allows them. See [water-levels.md](water-levels.md#flood-status-lhp). |
| **Stadt Köln events** | `stadt-koeln.de/externe-dienste/open-data/events-od.php` | Unversioned script URL | Q1 each year | A PHP script URL rather than a dataset API; check the offenedaten-koeln.de dataset if it stops answering. |
| **Köln Stadtbezirk outlines** | `packages/web/src/data/districts/koeln-bezirke.geojson`, converted once (2026-11-02) from `offenedaten-koeln.de/sites/default/files/uploaded_resources/Stadtbezirk_0.zip` (Shapefile, ETRS89 UTM 32N, dl-de/zero-2.0) | Only when the city redraws its Stadtbezirke (rare) | Once a year, Q1 | Bundled file, not fetched. To redo: `mapshaper Stadtbezirk.shp -proj wgs84 -simplify 3% keep-shapes -sort '+nummer' -filter-fields name -o koeln-bezirke.geojson precision=0.000001` (mapshaper installed outside the repo; the Shapefile's `name` holds the name, `nummer` the number). Names must stay those of `BEZIRKSBUERGERMEISTER.koeln` (`political-matching.test.ts`) and `KOELN_DISTRICTS` in `synthetic/generate.ts`. |
| **München Stadtbezirk outlines** | `packages/web/src/data/districts/muenchen-bezirke.geojson`, converted once (2026-11-02) from the GeodatenService WFS layer `gsm_wfs:vablock_stadtbezirk` (dataset `vablock_stadtbezirke_opendata`, dl-de/by-2.0) | Only on a boundary change (rare) | Once a year, Q1 | Bundled file. The WFS gives 27 polygons for 25 districts (18 and 19 in two parts each). To redo: `mapshaper <WFS GeoJSON in EPSG:4326> -dissolve sb_nummer copy-fields=sb_name -simplify 5% keep-shapes -sort '+sb_nummer' -rename-fields name=sb_name -filter-fields name -o muenchen-bezirke.geojson precision=0.000001`. dl-de/by-2.0 asks for the credit on the Sources page ("Landeshauptstadt München – GeodatenService", noting the changes). Names must match `MUENCHEN_DISTRICTS` in `synthetic/generate.ts`. |
| **Bezirksbürgermeister** | `BEZIRKSBUERGERMEISTER.berlin` in `ingest-political.ts` (`lastVerified` 2026-11-01) | Per election cycle | **December 2026**: on 2026-11-01 only Reinickendorf (Sebastian Pieper, CDU) and Spandau (Frank Bewig, CDU, re-elected) had elected their Bezirksamt; the other ten keep their outgoing mayors until they do. Then after the next Berlin elections (2031) | Names, parties, and profile URLs of 12 district mayors are hardcoded. Check each Bezirksamt's press releases (`berlin.de/ba-<bezirk>/aktuelles/pressemitteilungen/`) and its `politik-und-verwaltung/bezirksamt/` page, which lags. The BVVs' OParl agendas (`councilMeetings.bvv` in `berlin.ts`) show when "Wahl des Bezirksamtes" is scheduled. |
| **Bezirksbürgermeister Köln** | `BEZIRKSBUERGERMEISTER.koeln` in `ingest-political.ts`, from the nine Bezirksvertretung pages under `stadt-koeln.de/politik-und-verwaltung/bezirksvertretungen/` | Per election cycle | After the NRW local elections (next: 2030), and when the server warns (180 days after `lastVerified`, last 2026-11-01) | Elected by each Bezirksvertretung after the local elections of September 2025. Update names, parties and `lastVerified`. |
| **Oberbürgermeister Köln and München** | `OBERBUERGERMEISTER` in `ingest-political.ts`, from `stadt-koeln.de/politik-und-verwaltung/oberbuergermeister/torsten-burmester` and `stadt.muenchen.de/infos/oberbuergermeister.html` | Per election cycle | After the next OB elections (Köln 2030, München 2032), and when the server warns (180 days after `lastVerified`, last 2026-11-01) | Torsten Burmester (SPD) since 2025-11-01; Dominik Krause (Grüne) since 2026-05-01. München's 25 Bezirksausschuss chairs are not kept: too many honorary posts to maintain by hand, with no open dataset. |

---

## Research: Potential New Data Sources (2026-03-03)

- Bike-sharing stations (nextbike/Lime GBFS feeds — standardized, real-time)
- ~~Parking availability~~ — researched 2026-03-04, no real-time data for Berlin (no Parkleitsystem); static WFS data exists but low value for real-time dashboard
- Energy generation (solar/wind dashboards from Bundesnetzagentur SMARD API)
- Public WiFi hotspots (Berlin has a static dataset)
- EV charging stations (Bundesnetzagentur has a register)
- School closures / Kita strikes (no good API, would need scraping)

---

## Parking Availability — NOT FEASIBLE (No Real-Time Data)

Researched 2026-03-04. Full analysis: `.plans/completed/2026-03-04_parking-map-layer.md`

- **Real-time:** Berlin has no Parkleitsystem. No public API from any garage operator (APCOA, Contipark, Q-Park). Not in ParkAPI v3, not on Mobilithek. LiveParking.eu has Hamburg but not Berlin (and is "all rights reserved").
- **Static WFS (dl-de-zero-2.0):** Street parking (45,917 polygons), managed zones (100 polygons with fees/hours), P+R (48 points with surveyed occupancy), disabled parking (912 points). All verified working at `gdi.berlin.de/services/wfs/`.
- **Verdict:** Without real-time occupancy, static parking zones add little value to a real-time dashboard. Revisit if Berlin deploys a Parkleitsystem (eUVM project may lead to this, no timeline).

---

## Hospital Emergency Rooms — PARTIALLY FEASIBLE

### Static Layer (Easy)
- **WFS endpoint:** `https://gdi.berlin.de/services/wfs/krankenhaeuser?service=WFS&version=2.0.0&request=GetFeature&typeNames=krankenhaeuser:plankrankenhaeuser&outputFormat=application/json&srsName=EPSG:4326`
- **License:** DL-DE-Zero (free)
- **Data:** 64 plan hospitals with coordinates, bed counts, addresses, districts
- **ER hospitals:** 37 total (6 Notfallzentren + 31 Notfallkrankenhäuser) — cross-reference with official list at berlin.de/sen/gesundheit

### Real-Time Wait Times (Scraping Only)
**Vivantes** (8 hospitals, ~1/3 of Berlin ER capacity) publishes live data:
- Average wait time (rolling 6h), patients waiting, ambulance arrivals, critical cases
- Server-side rendered HTML — no JSON API
- No other hospital group publishes ER data
- IVENA (the real dispatching system) is closed to public