# Crime Atlas (Kriminalitätsatlas Berlin)

Berlin only. A `crime` map layer colours Berlin's 143 Bezirksregionen by how their rate of one offence group compares with the city's. Config-driven (`dataSources.crimeAtlas`, feature `crimeAtlas`), so another city with per-area police statistics could join with its own provider; Hamburg (PDFs only), Köln (CSVs to 2016) and München (nothing) have none ([cities.md](cities.md)).

## Source

- **Kriminalitätsatlas Berlin**, Polizei Berlin (LKA St 14), dataset `kriminalitatsatlas-berlin` on daten.berlin.de. One XLSX, `https://www.berlin.de/polizei/_assets/dienststellen/lka/fallzahlen_hz-2016-2025.xlsx` (627 KB, last modified 2026-09-29), with a `Fallzahlen_<year>` (cases) and an `HZ_<year>` (Häufigkeitszahl: cases per 100,000 residents) sheet for each year 2016–2025, 17 offence groups, one row per Bezirk and Bezirksregion. Yearly, about September. The URL carries the year range, so it is pinned: see the freshness inventory in [new-data-sources.md](new-data-sources.md).
- **Licence**: `cc-by-sa` (CKAN `license_id`, "Creative Commons Attribution Share-Alike", no version stated), attribution text "Polizei Berlin". Checked 2026-11-03 through datenregister.berlin.de's CKAN API (daten.berlin.de itself shows a bot check to scripts).
- **Share-alike**: the data City Monitor derives from it (the stored and served `kriminalitaetsatlas` GeoJSON: rates rounded to one decimal, joined to outlines) is an adaptation and is shared under the same licence, CC BY-SA. The Sources page says so next to the credit ("Source: Polizei Berlin, Kriminalitätsatlas, CC BY-SA. The map's derived data is shared under the same licence (CC BY-SA)."; `LICENCE_CREDITS` in `SourcesPage.test.tsx`). No test fixture copies the file: the tests build their own workbooks.
- **LOR**: since PKS 2023 the atlas uses the LOR 2021 Bezirksregionen (6-digit keys, "011001"); 2016–2021 sheets use the older 138. Only the newest year is read. Rows `xx99xx` ("Bezirk (…), nicht zuzuordnen") and `999900` hold cases the police could not place and have no rates; `999999` is Berlin as a whole.

## Outlines

`packages/server/data/berlin-bezirksregionen.geojson`: the GDI WFS `lor_2021:b_lor_bzr_2021` (Amt für Statistik Berlin-Brandenburg, CC BY 3.0 DE, credited on the Sources page), simplified once (2026-11-03) to 174 KB, with `id` (LOR key), `name`, `district` and `areaKm2`. All 143 keys of PKS 2025 match. The social atlas's Planungsräume (`CK.socialAtlasGeojson`) are not reused: dissolving 542 polygons needs a geometry library the server does not have, and bundling the coarser level is smaller than shipping the fine one.

## Offence groups

`CrimeIndicator` in `shared/types.ts`, read from these columns (headers with whitespace and hyphens removed, `CRIME_COLUMNS` in `lib/crime-atlas.ts`):

| Indicator | Column | Berlin 2025 per 100k |
|---|---|---|
| `total` | Straftaten insgesamt | 12,882 |
| `assault` | Körperverletzungen insgesamt | 1,277 |
| `robbery` | Raub (street robbery included) | 124 |
| `burglary` | Wohnraumeinbruch | 272 |
| `bikeTheft` | Fahrraddiebstahl | 580 |
| `kiez` | Kieztaten (the police's group of offences residents notice in their neighbourhood) | 3,174 |

The rates are per resident and counted where the offence happened, so areas with few residents and many visitors (Regierungsviertel 3.6× the city's total rate, Alexanderplatz, Tiergarten Süd) stand out; the sidebar note says so.

## Pipeline

- **Cron**: `ingest-crime-atlas`, `0 5 3 * *` (monthly). Fetch (60 s), stream the workbook keeping only the `Fallzahlen_<year>` and `HZ_<year>` sheets (`readSheets` in `lib/xlsx.ts`; a heavy job, see [server.md](server.md#memory-at-startup)), find the newest year with both sheets, parse both by LOR key, join the Bezirksregionen to the outlines. A missing header or column throws and keeps the previous data; areas without an outline are logged.
- **Data** (`CrimeAtlasData`): `year`, `city` (Berlin's rates and counts, the averages) and a GeoJSON FeatureCollection with flat `CrimeAreaProps` per area: `areaId`, `name`, `district`, each indicator's rate and `<indicator>Count`. ~206 KB, ~60 KB gzipped.
- **DB**: snapshot type `kriminalitaetsatlas`, 7-day retention with `keepLatest`; read without a schema like the population GeoJSON.
- **Cache**: `${cityId}:crime-atlas`, TTL 37.2 days (`CRIME_ATLAS_TTL_SECONDS`), warmed on start. Not in bootstrap.
- **Route**: `GET /api/:city/crime-atlas`, 12 h cache, heavy-payload rate limit, cache → DB → `{ data: null }`.

## Frontend

- `useCrimeAtlas(cityId, enabled)`: fetched only while the layer is on, never refetched (`staleTime: Infinity`).
- `layers/crime-atlas.ts`: fill by the area's rate ÷ the city's rate in five classes (`CRIME_CLASSES`: under 0.5×, 0.5–0.8×, 0.8–1.25×, 1.25–2×, 2× and more; yellow to dark red), outlines on top. Popup on hover and click: area, Bezirk, PKS year, and for each group the area's rate, the city's and the multiple, the chosen group in bold with its case count.
- Sidebar: one button per offence group (`crimeLayer` in `useCommandCenter`, default `total`) and `CrimeLegend` (year, city rate, classes, the per-resident note).
- i18n: `sidebar.layers.crime`, `sidebar.crime.*`, `sidebar.crimeLegend.*`, `mapPopup.crime.*` in all four languages.

## Key files

| File | Role |
|---|---|
| `packages/server/src/lib/crime-atlas.ts` | Sheet parser, newest year, join to outlines |
| `packages/server/src/cron/ingest-crime-atlas.ts` | Job |
| `packages/server/src/routes/crime-atlas.ts` | Route |
| `packages/server/data/berlin-bezirksregionen.geojson` | Outlines |
| `packages/web/src/components/map/layers/crime-atlas.ts` | Map layer and popup |
| `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Group buttons and `CrimeLegend` |
