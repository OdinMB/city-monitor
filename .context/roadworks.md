# Roadworks

The `roadworks` feature: construction sites and closures on the traffic map layer (sub-layer `roadworks` of `traffic`). One cron job, `ingest-construction` (`*/30 * * * *`), reads each active city's `dataSources.roadworks` and writes `ConstructionSite[]` (`shared/types.ts`) to `CK.constructionSites(cityId)` (TTL 1800 s) and to the `snapshots` table. The snapshot type is still `viz-roadworks` for every city: renaming it would need a migration and buys nothing.

## Providers

`dataSources.roadworks` is a `RoadworksSource`, tagged by `provider`. Each provider has one parser in `packages/server/src/lib/roadworks-parsers.ts`, tested against small recorded fixtures in `lib/roadworks-fixtures/` (recorded 2026-11-01); the job (`cron/ingest-construction.ts`) only fetches and dispatches. A new city with a new format is a new provider: add the union member, a parser with fixtures, the `switch` case, and a Sources credit (`SourcesPage.tsx` and `CONFIG_DRIVEN`/`LICENCE_CREDITS` in its test, keyed on the provider).

| City | `provider` | Source | Licence and credit | Shape |
|---|---|---|---|---|
| Berlin | `viz-berlin` | `api.viz.berlin.de/daten/baustellen_sperrungen.json` | dl-de/by-2.0, "Digitale Plattform Stadtverkehr Berlin" | Points, lines, GeometryCollections; VIZ picks what is current |
| Hamburg | `hamburg-ogc` | OGC API Features `api.hamburg.de/datasets/v1/baustellen/collections/baustelle/items?f=json&limit=1000` (Bauweiser, ~145 items, ~290 KB) | dl-de/by-2.0, "Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende" (the dataset's own attribution) | Points |
| Köln | `koeln-wfs` | MapServer WFS `geoportal.stadt-koeln.de/wss/service/baustellen_wfs/guest`, one GetFeature per configured layer (10 of 15) | dl-de/zero-2.0, credited "Stadt Köln" anyway | Points in EPSG:25832 |
| München | `muenchen-wfs` | GeoServer WFS `mor_wfs:baustellen_opendata` (GeoJSON, EPSG:4326) with a CQL filter | dl-de/by-2.0, "Landeshauptstadt München – opendata.muenchen.de" (the dataset's `GeoPortal Namensnennung`) | Polygons and MultiPolygons |

The old Hamburg WFS on the Transparenzportal (`baustellen-hamburg`) is an archive frozen in 2020; do not use it.

### Mapping

- **Date window (Hamburg, Köln, München):** a site is kept while its end day (inclusive, Berlin time) has not passed and its start is at most `ROADWORKS_LOOKAHEAD_DAYS` (14) ahead; one not yet started gets `isFuture: true`. Dates are passed on as "DD.MM.YYYY". VIZ data is taken as sent.
- **Hamburg:** `street` = `titel` (a project title such as "Hohe Weide/ Kranarbeiten", not always a street), `section` = `organisation`, `description` = `umfang` (the traffic impact) clipped to 400 characters, period `baubeginn`–`bauende`. Every site is `construction`. Ids `hh-<feature id>`.
- **Köln:** `street` = `Adresse`, `section` = `Kategorie`, no description, period from `Genehmigungs-Zeitraum` ("13-04-2026 bis 13-02-2027"). That is the **permit period**, which the dataset says need not be the construction period, so these sites carry `validity: 'permit'` and the popup labels the dates "Permit period" (`mapPopup.permitPeriod`). Layer `notfall` (emergency works) maps to `disruption`, the rest to `construction`. The WFS lists some permits twice at the same point; those are kept once. It ignores `srsName` (even with GML it labels UTM coordinates EPSG:4326), so `utm32ToLonLat` converts EPSG:25832 to WGS84 with the Krüger series. Layers left out in `koeln.ts`: `hochbau`, `baustelleneinrichtung`, `container`, `arbeitsbuehne`, `gruenflaechenarbeiten` (mostly pavements and private plots; together ~1,000 of the ~2,200 points). A failed layer fails the city's run, so the cache keeps the last full set instead of dropping one kind of works. Ten requests per run, ~350 KB in all.
- **München:** the full layer is ~5,600 features and 5.3 MB, mostly temporary no-parking zones. `MUENCHEN_CQL_FILTER` asks the server for `art='Baumaßnahme'` with `beeintraechtigung` mentioning the carriageway, a lane or a closure (`fahrbahn`, `fahrspur`, `vollsperr`, `straßensperr`, `sperrung`, `halbseitige sperre`), which leaves ~870 features (~0.9 MB); the date window then keeps ~840. Each polygon becomes a point at the area centroid of its largest part's outer ring (the map layer draws only points and lines). `street` = `strasse_hausnr`, `section` = `beschreibung`, `description` = `beeintraechtigung`. `closure` when an impairment item starts with "Vollsperr…" or "Straßensperrung" or is "Fahrbahn gesperrt"; "Zeitweise Vollsperre" and "halbseitige Straßensperrung" stay `construction`. A start of "Beginn vor mehr als einem Jahr" counts as begun and shows no start date. Timeout 45 s.

### Checks to repeat

- München's filter depends on the free-text values of `beeintraechtigung` and on `art`; if the count drops sharply, fetch the layer without `CQL_FILTER` and tally the field values again.
- Köln's layer names are fixed in `koeln.ts`; a renamed layer answers with an exception and fails the run (logged).
- Hamburg's `limit=1000` covers the collection (145 items in 2026-11); a larger one would need paging via the `next` link.

## Frontend

`useConstruction` (gated on the feature), `components/map/layers/traffic.ts` (`updateConstructionLayers`, `constructionPopupHtml`). Lines are dashed, points use the per-subtype construction icons. A range without a start shows "– <end>". No new browser host: all four feeds are fetched by the server.
