# Election results

The political map layer's **Election** view: each area of a city's latest election filled with its strongest party's colour, a popup with the area's party shares and turnout, and the city-wide result as a tab of the political tile. Added 2026-11-03.

| City | Election | Areas | Source | Licence |
|---|---|---|---|---|
| Berlin | Abgeordnetenhaus, 2026-09-20 (second votes) | 78 Wahlkreise | `DL_BE_AGHBVV2026.xlsx`, sheet `AGH_W2`, wahlen-berlin.de | CC BY 3.0 DE, Amt für Statistik Berlin-Brandenburg (the file's Impressum sheet) |
| Hamburg | Bürgerschaft, 2025-03-02 (Landesliste votes) | 90 Stadtteile and Stadtteil groups, covering all 99 Stadtteil outlines | `BUE2025_e_06.xlsx`, statistik-nord.de | Not catalogued (see Licences) |
| München | Stadtrat, 2026-03-08 | 25 Stadtbezirke | `endergebnis_stadtratswahl.zip` → `srw.stadtbezirke.stimmen.csv`, wahlen-muenchen.de | dl-de/by-2.0, Landeshauptstadt München – Kreisverwaltungsreferat, Wahlamt (CKAN `stadtratswahl-2026-ergebnisse-muenchen`) |
| Köln | — | — | Kommunalwahl 2025 not reachable: `wahlen.stadt-koeln.de` reset every connection on 2026-11-03, and Offene Daten Köln has no results after 2009 | — |

City-wide check values (2026-11-03): Berlin turnout 74.23 %, Die Linke 25.66, CDU 18.77, AfD 16.25, Grüne 14.29, SPD 12.11; strongest per Wahlkreis Die Linke 37, CDU 24, AfD 16, Grüne 1. Hamburg SPD 33.51, CDU 19.8, Grüne 18.45, turnout 67.61. München Grüne 26.49, CSU 24.87, SPD 19.15, turnout 52.3 (572,559 of 1,094,823).

## Config

`dataSources.electionResults` in the server config: `provider` (`berlin-agh-xlsx`, `hamburg-stadtteile-xlsx`, `muenchen-stadtrat-zip`), `url`, `election` (`abgeordnetenhaus`, `buergerschaft`, `stadtrat`; picks the label), `date`, and `outlines` (a file in `packages/server/data/`, read by `loadAreaOutlines`). The feature `electionResults` follows from the entry (`lib/city-features.ts`) and must be in the web config's `features`.

## Server

- `lib/election-parsers.ts`: one parser per provider, then `buildElectionResults`.
  - Berlin: sums the `AGH_W2` rows (urn and postal Wahlbezirke; postal rows carry their Wahlkreis) per Bezirk and Wahlkreis. The area id is the two-digit Bezirk plus the two-digit Wahlkreis ("0101"), as in the outlines' `awk`; the name is "Mitte 1".
  - Hamburg: the sheet gives percentages only, per Stadtteil, with Bezirk rows and a "Hamburg" total row. `stadtteilOutlineIds` matches a row to the Stadtteil outlines by name; a joined row ("Billbrook/Rothenburgsort", "Kleiner Grasbrook/Steinwerder") is split at "/", with "Kleiner" written "kl.", and its id is the outline ids joined with "+". The city total is the source's own row, not a sum. Unmatched rows are returned and logged.
  - München: `Stimmbezirksart` 1 (urn and postal together) and `Gebietsnummer` 1–25, named from the outlines.
  - `buildElectionResults`: the parties with at least 1 % city-wide, in city order, each area's share of them, the rest as `otherPct`, turnout, and the leader. Party names are normalised (`GRÜNE` → `Grüne`, `DIE LINKE` → `Die Linke`, `FREIE WÄHLER …` → `Freie Wähler`) so `party-colors.ts` finds them.
- `cron/ingest-election-results.ts`: monthly (`30 5 3 * *`), one download per city. It writes `{results, geojson}` as the `election-results` snapshot and fills two cache keys, `electionResults` and `electionGeojson` (TTL 37.2 days). The GeoJSON has one feature per outline with `{id, name, leader, leaderPct}`; a Hamburg group gives each of its outlines the group's result. A failed download or parse logs and keeps the previous data. Retention keeps the newest row (`keepLatest`).
- Routes: `GET /api/:city/election-results` and `/election-results/geojson`, cache then DB, 12 h HTTP cache. Not in bootstrap.

## Web

- `PoliticalLayer` `'elections'` (`map-layers.ts`), shown wherever the feature is, independent of the district outlines. München's political layer has only this view.
- `components/map/layers/elections.ts`: fill by `leader` with `getPartyColor`, opacity rising with `leaderPct` (15 % → 0.2, 45 % → 0.6), drawn under the district lines and labels; popup by `electionPopupHtml`. `CityMap` hides the representative markers in this view.
- Sidebar: `ElectionLegend` under the sub-layer list, with the parties that lead somewhere and the number of areas each leads.
- `PoliticalStrip`: an election tab with the top five parties as bars (all of them expanded), the others, turnout and, expanded, the strongest party per area. No freshness footer: the result is final.

## Outlines

- Berlin: `packages/server/data/berlin-agh2026-wahlkreise.geojson`, 78 features with `id` only, 108 KB. From the WFS `gdi.berlin.de/services/wfs/wahlgebiete_agh2026`, layer `agh2026_awk` (`srsName=EPSG:4326`, `outputFormat=application/json`), CC BY 3.0 DE, Quellenvermerk "Amt für Statistik Berlin-Brandenburg / Wahlgebiete für die Wahl zum 20. Abgeordnetenhaus von Berlin 2026". Simplified with a shared-border-preserving Douglas–Peucker at 0.0002° and 5 decimals (45,737 → 5,104 points, total 889.6 km²); `mapshaper <WFS JSON> -simplify interval=15 keep-shapes -each 'id=awk' -filter-fields id -o berlin-agh2026-wahlkreise.geojson precision=0.00001` gives the same kind of result. `area-outlines.test.ts` checks the ids.
- Hamburg and München reuse `hamburg-stadtteile.geojson` and `muenchen-stadtbezirke.geojson`.

## Licences

- Berlin and München: open licences; credits on the Sources page ("Wahlen Berlin (Abgeordnetenhauswahl 2026)", "Wahlamt München (Stadtratswahl 2026)").
- Hamburg: `BUE2025_e_06.xlsx` is not listed on the Transparenzportal; its sibling election files there are dl-de/by-2.0. Statistikamt Nord's imprint allows storing, passing on and distributing its content, in extracts too, with the source named and unchanged. The Sources page names "Statistisches Amt für Hamburg und Schleswig-Holstein" and says it is reproduced as its terms allow. Owner decision: accept that, or ask Statistikamt Nord to confirm dl-de/by-2.0 for the file.

## A new election

Change `url`, `date` (and `election` if the kind changes) in the city's config, and the Sources page entry. Berlin's next file also needs new outlines if the Wahlkreise are redrawn, and the sheet name `BERLIN_AGH_SHEET`. Next elections: Hamburg 2030, Berlin 2031, München 2032. Köln (Kommunalwahl 2030, or the 2025 results once reachable) needs its own provider.
