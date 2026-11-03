# Citizen Reports (Open311)

The `reports` map layer: issues residents report to their city (illegal dumping, street lights out, broken traffic lights, damaged roads, littered parks) over the last 14 days, as markers coloured by status with an icon for the category group. Köln and München; config-driven via `dataSources.citizenReports`, feature `citizenReports`.

## Sources

Both portals run Mark-a-Spot and speak Open311 GeoReport v2. No key.

| City | Portal | `baseUrl` | Licence (checked 2026-11-03) | Request page (`requestUrl`) |
|---|---|---|---|---|
| Köln | "Sag's uns" | `https://sags-uns.stadt-koeln.de/georeport/v2` | dl-de/zero-2.0: offenedaten-koeln.de dataset "Sags uns Anliegenmanagement Köln", distribution "… Open311 API", `dct_license` `dl-zero-de/2.0`. Credited "Stadt Köln" anyway | `https://sags-uns.stadt-koeln.de/node/{nid}` (the Drupal node; only the extensions name it) |
| München | "Mach München besser" | `https://machmuenchenbesser.de/api/georeport/v2` | CC0 1.0: opendata.muenchen.de dataset `meldungen-der-plattform-machmuenchenbesser-de` (IT-Referat). The dataset's own URLs without `/api` answer 404 | `https://machmuenchenbesser.de/requests/{id}` (the Nuxt front end's route) |

- **Volume (2026-11-03, 14 days):** Köln 946 reports (139 open, 18 in progress, 789 closed; ~250 KB as served), München 475 (204 in progress, 271 closed; ~140 KB).
- **Paging quirks:** a page holds at most 200 (Köln answers a larger `limit` with its default of 100). Results come oldest first once `start_date` is given; without it München returns an odd mix from 2022 on, so always pass it. `page` counts from 0 in Köln and from 1 in München, so the job does not use it: each page starts at the newest `requested_datetime` of the page before, and requests at that second are kept once. `discovery.json` fails on Köln (PHP error); nothing needs it.
- **Status:** Open311 knows `open` and `closed`. `extensions=true` adds Mark-a-Spot's status name (Köln: the last of `status_notes`; München: also `status_descriptive_name`): "Neu"/"Offen", "In Bearbeitung", "Abgeschlossen", "Erledigt/Beauftragt", "Nicht Stadtverwaltung". An open request whose name mentions "Bearbeitung" is `in_progress`. In München almost every open report is "In Bearbeitung".
- **Categories:** `service_name` as the portal names it; `service_code` is sometimes null in München. `reportGroup` maps names to eight groups by keyword (waste, lighting, traffic, roads, green, vehicles, graffiti incl. posters and ads, other), in an order that matters ("Leuchte verschmutzt" is lighting, "Park verschmutzt" waste, "Zu kurze Grünzeit" traffic).
- **Berlin:** daten.berlin.de lists "Ordnungsamt-Online" (LABO, dl-de/by-2.0, `https://ordnungsamt.berlin.de/frontend.webservice.opendata/api/meldungen`). Re-tested 2026-11-03: the endpoint closes the connection with no reply (curl 52), while the portal's front page answers. Left out until it answers with data. **Hamburg:** Melde-Michel has no open API or dataset.

## Privacy

The reports are public on the portals, but München's free text often carries the reporter's name and phone number (seen in live data, 2026-11-03), and photos may show people or number plates. Truncating would not remove a name in the first words, so the job keeps no free text at all: only id, category, group, status and the portal's status name, request and update time, a position rounded to four decimals (~10 m) and the request's page on the portal. `description`, `title`, `address`/`address_string`, `zipcode`, `media_url`/`media`, `status_note(s)` (official replies) are dropped in `parseOpen311Request` and never cached or stored. The popup links to the portal, where the full report lives under the city's own terms. The test fixtures replace every free-text field with fakes.

## Server

- `cron/ingest-citizen-reports.ts`, job `ingest-citizen-reports` at `7,22,37,52 * * * *` (every 15 min, off the quarter hour). Per city: the last `REPORT_WINDOW_DAYS` (14) in pages of 200 with 500 ms between pages, at most `MAX_PAGES` (15); Köln takes about five requests. A failed page fails the city's run and keeps the previous data (half a window would read as fewer reports).
- Output `CitizenReportData { reports, windowDays, total, counts }` (`shared/types.ts`, `CitizenReportDataSchema`): newest first, capped at `MAX_REPORTS` (1,000), counts by status of the kept ones.
- Cache `{city}:citizen-reports`, TTL 1800 s; not in bootstrap (too large). DB snapshot type `open311-reports`, written **at most every 55 minutes** per city (a row is ~250 KB for Köln), retention 1 day plus the row cap; `loadCitizenReports` max age 2 h. The startup freshness check wants 15 min, so a restart reruns the job.
- Route `GET /api/:city/citizen-reports`, cache → DB → `{ data: null, fetchedAt: null }`, `Cache-Control: max-age=300`.

## Frontend

- Layer `reports` (`DataLayer`, no number shortcut), shown where the city has `citizenReports` (`lib/map-layers.ts`). `useCitizenReports(cityId, enabled)` fetches only while the layer is on, refetching every 15 min.
- `components/map/layers/citizen-reports.ts`: `updateCitizenReportMarkers` registers 24 icons (8 group icons × 3 status colours: open red, in progress amber, closed green) and draws one symbol layer, zoom-scaled, open reports on top (`symbol-sort-key`) and closed ones at 55 % opacity. `citizenReportPopupHtml`: category, translated status with the portal's own word where it differs, report and update time in the UI language, "View on the city's portal" (https links only) and the portal's name.
- Sidebar: `CitizenReportLegend` under the active layer, the three status colours with their counts and "Reports of the last 14 days".
- i18n: `sidebar.layers.reports`, `sidebar.reports.*`, `mapPopup.reports.*` in all four bundles.
- No CSP change: the browser loads nothing from the portals (links only).

## Tests

- `cron/ingest-citizen-reports.test.ts`: group mapping, status, page URLs, parsing on recorded and anonymised requests (`cron/fixtures/open311-koeln.json`, `open311-muenchen.json`), that no fake name, phone, address or photo survives, paging by time, failure handling, hourly DB writes.
- `routes/citizen-reports.test.ts`, `components/map/layers/citizen-reports.test.ts`, the popup in `popup-language.test.ts`, the legend in `DataLayerToggles.test.tsx`.

## Adding another city

A Mark-a-Spot or other GeoReport v2 server needs only a `dataSources.citizenReports` entry with its `baseUrl` and `requestUrl`, `citizenReports` in its web features, a portal name in `REPORT_PORTALS` (`citizen-reports.ts`) and a Sources credit (plus `CONFIG_DRIVEN`/`LICENCE_CREDITS`). Check its paging (`limit` cap, sort order) and status names first.
