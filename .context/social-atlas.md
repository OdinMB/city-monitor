# Social Atlas & Labor Market

## Social Atlas Map Layer

All four cities. `dataSources.socialAtlas` names a provider, and `lib/social-atlas-parsers.ts` has one parser per provider that turns the source into `SocialAtlasFeatureProps` per area. The four indicator slots (`unemployment`, `singleParent`, `welfare`, `childPoverty`) mean roughly the same in every city but each source defines them its own way, so the web app labels them per city and never as Berlin's MSS terms (see "Frontend Map Layer"). A slot the source lacks stays `null` and its sub-layer is hidden for that city.

| City | Provider | Areas | Indicators (slot → source definition) | Status index | Edition |
|------|----------|-------|----------------------------------------|--------------|---------|
| Berlin | `mss-wfs` | 535 Planungsräume | s1 unemployment, s2 children in single-parent households, s3 transfer receipt, s4 child poverty | MSS status index (4 classes) | MSS 2025 (data 31 Dec 2024) |
| Hamburg | `hh-sozialmonitoring` | 857 Statistische Gebiete | S4 unemployed (SGB II/III), S2 children of single parents, S3 SGB II and AsylbLG recipients, S5 children on minimum income | Sozialmonitoring Statusindex (4 classes; not the MSS index) | Bericht 2025 |
| Köln | `koeln-datenkatalog` | 570 Statistische Quartiere | D0001P unemployment rate, A0269P single-parent households (share of households), C0007P SGB II recipients under pension age | none | data year 2025 (31 Dec) |
| München | `muenchen-indikatorenatlas` | 25 Stadtbezirke | Arbeitslose – Anteil (of residents 15–64), Haushalte Alleinerziehend (share of households), employable SGB II recipients (of residents 15–64), non-employable SGB II recipients (Sozialgeld, of residents 0–14) | none | data year 2024 |

`socialAtlasEdition(source)` gives the edition the web app prints next to each indicator; `config/index.test.ts` on the web side checks that the web table (`lib/social-atlas.ts`) has the same provider, edition, indicators and status flag as the server config.

### Berlin: MSS 2025

**Monitoring Soziale Stadtentwicklung (MSS) 2025** from Berlin Senate, served via WFS.

- **WFS URL:** `https://gdi.berlin.de/services/wfs/mss_2025` (switched from `mss_2023` on 2026-11-01; same fields)
- **License:** dl-de-zero-2.0 (free, no attribution required)
- **Data period:** data as of 31 Dec 2024 (`zeit` 202412), report 2025, WFS registered on daten.berlin.de 2026-10 (biennial; MSS 2027 next)
- **Granularity:** 535 valid of 542 Planungsräume (LOR 2021, the same areas as the population XLSX); MSS 2023 had 536

Two WFS layers are fetched and joined on `plr_id`. `mssLayerNames` derives them from the edition at the end of `wfsUrl`, so a new edition is a one-line change in `berlin.ts` as long as its fields stay the same:

| Layer | Purpose |
|-------|---------|
| `mss2025_indexind_542` | Raw indicators: unemployment (s1), single-parent (s2), welfare (s3), child poverty (s4), population (ew), geometry |
| `mss2025_indizes_542` | Composite status index: si_n (1-4 scale), si_v (verbal label) |

Features with `kom !== 'gültig'` (`ungültig (EW unter 300)`, `ungültig (Ausreißer)`) are filtered out. The Berlin population layer takes its PLR outlines from this layer's cache entry, so an area dropped here also drops from the population map.

### Hamburg: Sozialmonitoring Integrierte Stadtteilentwicklung

- **Source:** the results tables of the report (`Upload__Sozialmonitoring-Bericht_2025_Ergebnistabellen.XLSX`), linked from the Transparenzportal dataset "Sozialmonitoring Integrierte Stadtteilentwicklung – Bericht 2025 – Anhang". The URL holds a GUID that changes with each report: `xlsxUrl` and `reportYear` in `hamburg.ts`.
- **Licence:** dl-de/by-2-0, credit "Freie und Hansestadt Hamburg, Behörde für Stadtentwicklung und Wohnen".
- **Reading:** the job streams the workbook with `readSheets` (`lib/xlsx.ts`), keeping only the two sheets below, and is `heavy` ([server.md](server.md#memory-at-startup)).
- **Sheets:** `I_Indizes` (Bezirk, Stadtteil, Statistisches Gebiet, residents, Statusindex class) and `II_Indikatoren`. Sheet II gives each indicator as a **z-score**, not a share, with the city mean (`Mittelwert`) and standard deviation (`SD`) of the shares in their own rows. The parser recomputes the share as (mean + z × SD) × 100, rounded to one decimal and floored at 0. Checked against areas whose Stadtteil is a single Statistisches Gebiet: Francop's S5 comes out at 6.8 %, as the Stadtteil statistics publish it; the lowest areas land at exactly 0, as a plain z-transform would. If a later report changes the transform, this check is the one to repeat.
- **Status index:** the four classes "hoch" … "sehr niedrig" map to 1–4 (`statusIndexOf`). It is Hamburg's own index, built from Hamburg's indicators; the popup labels it "Sozialmonitoring status".
- **Names:** the XLSX has no names for Statistische Gebiete, so an area reads "Stadtteil ID" (e.g. "Francop 102001"), with the Bezirk as `bezId`.
- **Outlines:** `packages/server/data/hamburg-statistische-gebiete.geojson` (857 areas, id only). The Sozialmonitoring OGC API (`api.hamburg.de/datasets/v1/sozialmonitoring`) carries them, but at 25 MB per year with no simplification parameter, so they are committed simplified. Rebuild when the Statistische Gebiete change (see the freshness inventory).

### Köln: Statistischer Datenkatalog

- **Source:** `Stadt_Köln_Statistischer_Datenkatalog_0.csv` on offenedaten-koeln.de, one CSV with every year and spatial level (BOM, semicolons, decimal commas). `lib/koeln-datenkatalog.ts` parses it; the social atlas reads the rows at level `Statistische Quartiere` for `year` in `koeln.ts`.
- **Licence:** dl-de/by-2-0, credit "Stadt Köln – Amt für Stadtentwicklung und Statistik". The unemployment figures come from the Bundesagentur für Arbeit through the city.
- **No child-poverty slot:** the Datenkatalog has no SGB II share of children, so that sub-layer is hidden for Köln. No status index either.
- **Outlines:** `packages/server/data/koeln-quartiere.geojson` (570 Quartiere with name, Stadtbezirk and area), from `Statistisches_Quartier_0.zip` on Offene Daten Köln (dl-de/zero-2.0).

### München: Indikatorenatlas

- **Source:** the Statistisches Amt's Indikatorenatlas on opendata.muenchen.de, split into one CKAN dataset per indicator (`datasets` in `muenchen.ts`). Each dataset has one CSV whose file name carries the release date (`indikat_2605arbeitsmarkt_arbeitslose_-_anteil_18_05_26.csv`), so `fetchIndikatorCsv` (`lib/muenchen-indikatorenatlas.ts`) asks `package_show` for the current URL on every run: two requests per indicator. A failed indicator fails the run, which keeps the previous cache entry.
- **CSV:** `Indikator, Ausprägung, Jahr, Raumbezug, Indikatorwert, Basiswert 1, Basiswert 2, …`, quoted, decimal points, unquoted `NA` for an empty cell. `Raumbezug` is "Stadt München" or "01 Altstadt - Lehel"; the two-digit number is the area ID, matching the outline file. Every year since 2000 (2006 for SGB II), with breakdowns such as `insgesamt`, `deutsch`, `nichtdeutsch`; the parser reads `insgesamt` of the configured `year`.
- **Indicators:** unemployment `indikatorenatlas-2014-arbeitsmarkt-arbeitslosendichte-83r65mct` (unemployed per resident aged 15–64, the same base as Berlin's and Hamburg's); single parents `indikatorenatlas-bevoelkerung-haushalte-alleinerziehend` (single-parent households with a child under 18 per private household, as Köln's); welfare `…-regel-leistungsberechtigte-erwerbsfaehig-anteil-83r65mct` (employable SGB II recipients per resident aged 15–64); child poverty `…-regel-leistungsberechtigte-nicht-erwerbsfaehig-anteil-83r65mct` (non-employable SGB II recipients, Sozialgeld, per resident aged 0–14, nearly Berlin's MSS s4). The labour-market counts are fractional, which suggests yearly averages of the BA's monthly figures; the source does not say.
- **Edition:** `year: 2024` in `muenchen.ts`. The May 2026 release has 2024 for the labour-market indicators and 2025 for single-parent households; all four are pinned to 2024 so one edition names them. `population` is the unemployment figure's base (residents 15–64), since none of these files counts all residents; the popup does not show it.
- **Coarse:** 25 Stadtbezirke, against hundreds of small areas elsewhere. The sidebar labels say so ("Unemployment (2024, 25 districts only)", `areas` in `SOCIAL_ATLAS.muenchen`), and district averages sit in a narrow band (unemployment 2.9–5.2 % in 2024), so München has its own colour stops. No finer level: "Bevölkerung Stadtbezirksteile" (108 areas) stops at 2017.
- **Licence:** `dl-by-de/2.0` on every Indikatorenatlas dataset; credit "Landeshauptstadt München, Statistisches Amt". The labour-market figures come from the Bundesagentur für Arbeit through the city.
- **Outlines:** `packages/server/data/muenchen-stadtbezirke.geojson` (25 Stadtbezirke with `id` "01"…"25", name and area), the web app's district file with each district's `flaeche_qm` from the GeodatenService WFS (sum 310.7 km², as the Indikatorenatlas has it).

### Outline files

Area outlines that do not come with the data ship in `packages/server/data/*.geojson` and load through `lib/area-outlines.ts` (`loadAreaOutlines(file)`, memoized; ids as strings). Each config's `outlines` names one file. `area-outlines.test.ts` checks counts, that every outline lies in its city, and that every configured file exists. They were made with mapshaper (run from a scratch folder, not a repo dependency); the commands are in the freshness inventory in [new-data-sources.md](new-data-sources.md).

### Architecture

- **Cron:** `ingest-social-atlas` runs weekly (Sunday 5AM) for every active city with `dataSources.socialAtlas`, conditional `runOnStart` based on DB freshness. An empty result keeps the previous cache entry instead of overwriting it.
- **DB:** Unified `snapshots` table, type `mss-social-atlas` for every provider (the name predates the other cities; kept so stored rows stay readable)
- **Cache key:** `${cityId}:social-atlas:geojson` (full GeoJSON: Berlin ~500KB, Hamburg ~760KB, Köln ~430KB, München ~25KB)
- **TTL:** 604800 seconds (7 days)
- **City config:** `dataSources.socialAtlas: SocialAtlasSource` (`shared/types.ts`), a union tagged by `provider`
- **API:** `GET /api/:city/social-atlas` - full GeoJSON FeatureCollection (for map layer)

### Frontend Map Layer
- **DataLayer:** `'social'`, for cities with the `socialAtlas` feature (`cityLayers` in `lib/map-layers.ts`). Sub-layers (`SocialLayer`): `unemployment` (default), `single-parent`, `welfare`, `child-poverty` draw this choropleth, limited to the indicators the city's source has; `rent` (the `rentMap` feature: Berlin and Hamburg, `RENT_MAP_WMS` per city) swaps it for the rent-map WMS overlay and its legend instead. In Hamburg the indicators come first and the rent map last.
- **Per-city labels:** `SOCIAL_ATLAS` in `packages/web/src/lib/social-atlas.ts`, keyed by city ID: provider, edition, status index (if any), an optional `areas` note for a coarse source (`socialAtlas.areas.*`) and one entry per indicator with its label key (`socialAtlas.indicator.*`) and optional colour stops (Köln's single-parent households use 0–10 %; München has stops for all four). The sidebar reads "label (edition)", or "label (edition, areas)" for München.
- **Lazy fetch:** GeoJSON only fetched while one of the indicator sub-layers is on (`useSocialAtlas` with `enabled` flag)
- **Choropleth:** Fill layer colored by the selected indicator's percentage, each with its own 5-stop ramp (`SOCIAL_ATLAS_COLOR_RAMPS` in `map/constants.ts`, overridable per city) + thin line borders. Null values draw transparent. The status index is not drawn.
- **Popup:** area name, the status index where the city has one (`socialAtlas.status.*`), and the city's indicators with its own labels (`socialAtlasPopupHtml(props, atlas)`); a missing value shows a dash

## Labor Market Dashboard Tile (BA Monthly)

**Bundesagentur für Arbeit (BA) Statistics API** - monthly unemployment key figures (Eckwertetabelle) for all four cities.

- **Config:** `dataSources.laborMarket: { provider: 'ba', scope: 'bundesland' | 'kreis', name }`. `baTableUrl` turns it into `…/tableFetch/csv/EckwerteTabelleALOBL?Bundesland=<name>` (Land table) or `…/EckwerteTabelleALOKr?Kreis=<name>` (Kreis table), with `name` URL-encoded:

| City | Scope | `name` (the BA's spelling) | Encoded query |
|---|---|---|---|
| Berlin | `bundesland` | `Berlin` | `Bundesland=Berlin` |
| Hamburg | `bundesland` | `Hamburg` | `Bundesland=Hamburg` |
| Köln | `kreis` | `Köln, Stadt` | `Kreis=K%C3%B6ln%2C%20Stadt` |
| München | `kreis` | `München, Landeshauptstadt` | `Kreis=M%C3%BCnchen%2C%20Landeshauptstadt` |

- **Base URL:** `https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/csv/` (API documented at statistik.arbeitsagentur.de, "API-ALO"; the official area names are in `DR-LZR-persistListenfelderJSON.js`)
- **Kreis vs Land table:** same header and the same eight rows; only the metadata line reads `Kreis:;` instead of `Land:;`, which the parser ignores (it starts at "Ausgewählte Merkmale"). Verified live 2026-11-02, all four answering with October 2026. Use the Kreis table of a kreisfreie Stadt, never its Agentur für Arbeit district (AA München covers more than the city)
- **Auth:** None
- **Format:** CSV (semicolons, German number formatting)
- **Update:** Monthly
- **License:** the CSV footer allows storing and passing the data on with the source named, and asks web publications to link statistik.arbeitsagentur.de. The Sources page credits "© Statistik der Bundesagentur für Arbeit" with that link for each city (`baSource` in `SourcesPage.tsx`)

### Architecture

- **Cron:** `ingest-labor-market` runs daily (7AM), one request per active city with `dataSources.laborMarket`; a failing city is logged and skipped. Conditional `runOnStart` based on DB freshness (`serves`: cities with the source)
- **DB:** Unified `snapshots` table, type `ba-labor-market` (one JSONB row per city and run), kept 730 days (`HISTORY_RETENTION` in `cron/data-retention.ts`) for the history endpoint
- **Cache key:** `${cityId}:labor-market`
- **Tests:** `cron/fixtures/ba-eckwerte-koeln.csv` and `ba-eckwerte-muenchen.csv`, the Kreis tables recorded 2026-11-02
- **TTL:** 86400 seconds (1 day)
- **API:** `GET /api/:city/labor-market` - `LaborMarketSummary`; `GET /api/:city/labor-market/history?range=Nd` - `HistoryPoint[]` (default 365d, max 730d, cached 86400s; the web `useLaborMarketHistory` hook exists but no component calls it)

### Shared Types

- `SocialAtlasFeatureProps` - properties on each GeoJSON feature (map layer)
- `LaborMarketSummary` - unemploymentRate, totalUnemployed, sgbIIRate, sgbIICount, underemploymentRate, underemploymentCount, yoyChangeAbsolute/Percent per indicator, reportMonth

### Dashboard Tile
- `LaborMarketStrip` - 3 headline percentages: overall unemployment rate, SGB II rate, and underemployment rate, each with count + YoY trend, plus report month
- Shown for a city whose web config lists the `laborMarket` feature (`CommandLayout.tsx`); all four do
- Data pre-populated from bootstrap for instant display

### i18n
- Map layer: `sidebar.layers.social`, `sidebar.social.rent`; indicator labels (sidebar and popup) under `socialAtlas.indicator.*`, status-index names under `socialAtlas.status.*`, area notes under `socialAtlas.areas.*`
- Dashboard tile: keys under `panel.laborMarket.*`
- All 4 languages: EN, DE, TR, AR

## Key Files

| File | Role |
|------|------|
| `packages/server/src/cron/ingest-social-atlas.ts` | Fetch per provider, join outlines, cache + DB (map layer) |
| `packages/server/src/lib/social-atlas-parsers.ts` | One parser per provider, indicators and status flag per provider, edition |
| `packages/server/src/lib/koeln-datenkatalog.ts` | Köln Datenkatalog CSV parser (also used by population) |
| `packages/server/src/lib/muenchen-indikatorenatlas.ts` | München Indikatorenatlas: CKAN lookup and CSV parser (also used by population) |
| `packages/server/src/lib/area-outlines.ts` | Loads the committed outline files in `packages/server/data/` |
| `packages/server/src/lib/social-atlas-fixtures/` | Trimmed recorded source files for the parser tests |
| `packages/web/src/lib/social-atlas.ts` | Per-city labels, edition and status index |
| `packages/server/src/cron/ingest-labor-market.ts` | BA CSV fetch, parse, cache (dashboard tile) |
| `packages/server/src/routes/social-atlas.ts` | GeoJSON endpoint (map layer) |
| `packages/server/src/routes/labor-market.ts` | Labor market endpoint (dashboard tile) |
| `packages/web/src/hooks/useSocialAtlas.ts` | Lazy GeoJSON hook (map layer) |
| `packages/web/src/hooks/useLaborMarket.ts` | Labor market hook (dashboard tile) |
| `packages/web/src/components/strips/LaborMarketStrip.tsx` | Dashboard tile |
| `packages/web/src/components/map/layers/choropleth.ts` | `updateSocialAtlasLayer` and `socialAtlasPopupHtml` (map layer) |
