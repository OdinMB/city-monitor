# Population Demographics

All four cities. `dataSources.population` names a provider; `lib/population-parsers.ts` has one parser per provider that returns per-area counts (total, youth, elderly, foreign, optional area) and the snapshot date.

| City | Provider | Areas | Counted | Change compared with | Licence |
|------|----------|-------|---------|----------------------|---------|
| Berlin | `afstat-ewr-xlsx` | 536 Planungsräume | half-yearly (30 Jun, 31 Dec) | previous stored snapshot (half-year) | CC-BY |
| Hamburg | `hh-stadtteile` | 99 Stadtteile | yearly (31 Dec) | the previous year in the same source | dl-de/by-2-0 |
| Köln | `koeln-datenkatalog` | 570 Statistische Quartiere | yearly (31 Dec) | the previous year in the same source | dl-de/by-2-0 |
| München | `muenchen-indikatorenatlas` | 25 Stadtbezirke | yearly (31 Dec) | the previous year in the same source | dl-de/by-2-0 |

## München: Indikatorenatlas

- **Source**: two Indikatorenatlas datasets on opendata.muenchen.de, looked up through CKAN `package_show` as for München's social atlas ([social-atlas.md](social-atlas.md)): "Bevölkerung – Altersgruppen" (`indikatorenatlas-bevoelkerung-altersgruppen-83r65mct`, ~1.1 MB) and "Bevölkerung – Nichtdeutsche" (`indikatorenatlas-bevoelkerung-nichtdeutsche-83r65mct`). Every year since 2000; the parser takes the newest (2025 in the May 2026 release), so a new year needs no change.
- **Fields used**: Basiswert 1 (the count, not the share in Indikatorwert) of the rows `insgesamt`, `bis 17 Jahre` and `65 Jahre und älter`, and the non-Germans' `insgesamt`. Residents with their main home in München (Hauptwohnsitzbevölkerung).
- **Outlines and area**: `packages/server/data/muenchen-stadtbezirke.geojson`, which carries each Stadtbezirk's area from the GeodatenService. Densities match the Indikatorenatlas's own "Bevölkerungsdichte" (Altstadt-Lehel 6,550/km²).
- **Coarse**: 25 Stadtbezirke; the map is a district map, not a small-area one. Checked live 2026-11-02: 1,612,429 residents on 31 Dec 2025, +8,653 (+0.5 %) on the year before.

## Hamburg: Regionalstatistische Daten der Stadtteile

- **Source**: Statistikamt Nord's OGC API, `https://api.hamburg.de/datasets/v1/regionalstatistische_daten_stadtteile/collections/regionalstatistische_daten_stadtteile/items` (`itemsUrl` in `hamburg.ts`). `hamburgStadtteileUrl` adds `skipGeometry=true` and a `properties=` list (`HH_STADTTEIL_PROPERTIES`), so all years of all Stadtteile come as ~340 KB of JSON. The parser takes the newest `jahr_date`, so a new year needs no change.
- **Fields used**: residents, under-18 and 65+ counts (`bev_u18`, `bev_ab65`), foreign residents (`bev_auslaender_anz`), `flaeche_brutto_ha` (area, ha → km²).
- **Outlines**: `packages/server/data/hamburg-stadtteile.geojson` (99 Stadtteile with name and Bezirk), from the Stadtteil WFS, simplified with mapshaper.
- **Credit**: "Statistisches Amt für Hamburg und Schleswig-Holstein, dl-de/by-2-0".

## Köln: Statistischer Datenkatalog

- **Source**: the same CSV as Köln's social atlas ([social-atlas.md](social-atlas.md)), level `Statistische Quartiere`, newest year in the file. Codes: A0025A residents, A0002A foreign residents, and the age bands A0029A, A0035A, A0291A, A0043A (under 18) and A0295A, A0065A, A0027A (65 and over).
- **Outlines and area**: `packages/server/data/koeln-quartiere.geojson`, which carries each Quartier's area.
- **Snapshot date**: 31 December of the data year.

## Berlin: Data Source

**Amt für Statistik Berlin-Brandenburg** — semi-annual Einwohnerregisterstatistik (EWR) for Berlin, published as XLSX.

- **File pattern**: `SB_A01-16-00_{YYYY}h{01|02}_BE.xlsx`, `xlsxUrl` in `berlin.ts`
- **Download base**: `https://download.statistik-berlin-brandenburg.de/` (hashed URL paths, see freshness inventory)
- **Current URL**: `https://download.statistik-berlin-brandenburg.de/fca0a030166493d0/1289b0921aa2/SB_A01-16-00_2026h01_BE.xlsx` (30 June 2026, 3,917,196 residents; same sheet and column layout as 2025h02, checked 2026-11-01)
- **Where to find the next one**: the publication page `https://www.statistik-berlin-brandenburg.de/a-i-16-hj` links the newest XLSX (the page also carries a `…_Karte_Ausl.xlsx`, which is not the one)
- **Snapshots**: h01 = June 30, h02 = December 31 (published ~3 months later)
- **Granularity**: 536 LOR Planungsräume
- **License**: CC-BY
- **Dependency**: `exceljs` npm package for XLSX parsing

### XLSX Structure

| Sheet | Contents |
|-------|----------|
| **Schlüssel** | PLR name lookup (BEZ, PGR, BZR, PLR, Planungsraumname) |
| **T2** | Population by age groups per PLR (total, under6, 6-15, 15-18, 18-27, 27-45, 45-55, 55-65, 65+, female, foreigners) |

Numbers use spaces as thousands separators. PLR-level rows are identified by all 4 geographic columns (BEZ, PGR, BZR, PLR) being filled numeric values — aggregation rows have text headers.

**Important**: The old CSV URLs (`/opendata/EWR_L21_*`) are broken. The site migrated to a Scrivito SPA that returns HTML for all `/opendata/` paths. Use XLSX files from the `download.` subdomain.

## Architecture

Config-driven: the job runs for every active city with `dataSources.population`, and fetches nothing for the others.

- **Cron**: `ingest-population` — `0 6 1 * *` (monthly on the 1st at 6 AM; data is semi-annual or yearly but we check monthly). It depends on `ingest-social-atlas` because Berlin's polygons come from that cache.
- **DB**: Unified `snapshots` table, type `afstat-population` for every provider (name kept from Berlin; data JSONB contains `{ geojson, summary }`)
- **Cache keys**: `${cityId}:population:geojson`, `${cityId}:population:summary`
- **TTL**: 3214080 seconds (37.2 days: the longest gap between runs, 31 days, × 1.2), so an entry lasts until the next run. Data retention deletes `afstat-population` rows after 7 days but keeps the newest one (`keepLatest`), so the routes' DB fallback and cache warming after a restart still find the latest data, and the next run has a previous snapshot for the change figure. Shared by ingestion, routes and cache warming as `POPULATION_TTL_SECONDS`
- **Bootstrap**: `populationSummary` (~200B) included in bootstrap for instant tile display
- **Lazy fetch**: GeoJSON (~500KB) fetched only when a population map sub-layer is active

### Ingestion Flow

1. Fetch the source named in the city config (60s timeout) and parse it with the provider's parser (Berlin: sheets T2 and Schlüssel, streamed with `readSheets` in `lib/xlsx.ts`, which keeps only those two and fills merged ranges; a heavy job, see [server.md](server.md#memory-at-startup))
2. For each area: total, youth (0-17), elderly (65+), foreign count, and the area if the source gives one
3. Polygons: Berlin from the social atlas cache (`CK.socialAtlasGeojson`), the others from their outline file (`lib/area-outlines.ts`; München's carries the area too)
4. Area: the source's, else the outline's, else the polygon's via the geodetic Shoelace formula (`polygonAreaKm2`)
5. Build GeoJSON FeatureCollection with `PopulationFeatureProps` per feature
6. Aggregate city-wide `PopulationSummary` (weighted percentages; density = residents of mapped areas / their area)
7. Change: where the source has the previous year (Köln, Hamburg, München), against that, with `changePeriod: 'year'`; otherwise against the previous stored snapshot (`'half-year'`). A rerun over the same snapshot date keeps the change it recorded the first time instead of resetting it to 0.
8. Write to DB + cache

## API Endpoints

| Endpoint | Response | Cache-Control |
|----------|----------|---------------|
| `GET /api/:city/population` | GeoJSON FeatureCollection (~500KB) | 12h |
| `GET /api/:city/population/summary` | `PopulationSummary` (~200B) | 12h |

Both follow the 3-tier pattern: cache → DB fallback → null.

## Shared Types

- `PopulationFeatureProps` — per-PLR GeoJSON properties: plrId, plrName, population, density, foreignPct, elderlyPct, youthPct
- `PopulationSummary` — city aggregate: total, density, foreignTotal/Pct, elderlyPct, youthPct, workingAgePct, changeAbsolute/Pct, snapshotDate, `changePeriod` (`'half-year'` | `'year'`, optional; absent means half-year)

## Frontend

### Map Layer

The `population` data layer (its own sidebar toggle, for cities with the `population` feature, which the server derives from `dataSources.population`) has 3 choropleth sub-layers, one active at a time (`PopulationLayer` in `useCommandCenter.ts`, default `pop-density`). It is independent of the `social` layer; both can be on at once:

| Sub-layer | Property | Color Ramp |
|-----------|----------|------------|
| `pop-density` | `density` | Blue (0 → 30000/km²) |
| `pop-elderly` | `elderlyPct` | Amber (0% → 40%) |
| `pop-foreign` | `foreignPct` | Cyan (0% → 50%) |

Popup shows the area name + all 5 metrics for any sub-layer. The density ramp tops out at Berlin's 30000/km²; Hamburg's Stadtteile and Köln's Quartiere sit lower on it, and München's district averages (about 1,900 to 16,000/km²) are smoothed over whole Stadtbezirke.

### Dashboard Tile

`PopulationStrip` — not expandable, shown where the city has the `population` feature (`has('population')` in `CommandLayout.tsx`, services row). Shows total population with the change since the previous half-year or year (`panel.population.change` / `changeYear`, by `changePeriod`), an age donut (youth/working age/elderly), density, foreign population share, and a footnote with the snapshot date.

## Key Files

| File | Role |
|------|------|
| `packages/server/src/cron/ingest-population.ts` | Fetch per provider, GeoJSON build, change, cache + DB write |
| `packages/server/src/cron/ingest-population.test.ts` | Unit tests with mock XLSX and the Köln, Hamburg and München fixtures |
| `packages/server/src/lib/population-parsers.ts` | One parser per provider (Berlin EWR XLSX, Köln CSV, Hamburg OGC JSON, München Indikatorenatlas CSVs) |
| `packages/server/src/routes/population.ts` | REST endpoints (GeoJSON + summary) |
| `packages/server/src/routes/population.test.ts` | 5 integration tests |
| `packages/web/src/hooks/usePopulation.ts` | Lazy GeoJSON hook (map layer) |
| `packages/web/src/hooks/usePopulationSummary.ts` | Summary hook (dashboard tile) |
| `packages/web/src/components/strips/PopulationStrip.tsx` | Dashboard tile |
| `packages/web/src/components/map/layers/choropleth.ts` | `updatePopulationLayer` and `populationPopupHtml` (map layer) |

## i18n

- Sidebar: `sidebar.layers.population`, sub-layers `sidebar.population.pop-density`, `sidebar.population.pop-elderly`, `sidebar.population.pop-foreign`
- Tile: `panel.population.*` (title, total, foreign, elderly, youth, workingAge, ageBreakdown, change, changeYear, empty, source, density, densityLabel, german)
- All 4 languages: EN, DE, TR, AR
