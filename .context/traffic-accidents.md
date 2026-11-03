# Traffic accidents

A map layer of last year's road accidents with personal injury for all four cities, from the Unfallatlas of the Statistische Ämter des Bundes und der Länder. Up to zoom 12 a heat map shows where accidents gather; from zoom 12 each accident is a circle coloured by its worst injury (dark red someone killed, red seriously injured, amber slightly injured), with the worst drawn on top. Accidents with someone killed are circles at every zoom, so the heat map never hides them. The sidebar filters to accidents with a bicycle or with a pedestrian involved and shows the year and the count per severity for the filter. The popup gives the severity, the accident type and kind, month and year, weekday and hour band, and who was involved. No dashboard tile. Added 2026-11-03.

## Source (`dataSources.trafficAccidents`)

- **Files:** `https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/`, one `Unfallorte<year>_EPSG25832_CSV.zip` a year (2016–2025 listed on 2026-11-03), found through `index.json` in the same folder. The old statistikportal.de download paths answer 404; open.nrw hosts the official files. The 2025 archive is 12.6 MB (timestamp 2026-07-07), holding `csv/Unfallorte_2025_LR_BasisDLM.csv` (42 MB, 273,007 rows, UTF-8 with BOM, CRLF, `;`, decimal commas). Field codes: `DSB_Unfallatlas.pdf` in the folder.
- **Licence:** Datenlizenz Deutschland – Namensnennung – Version 2.0, on every GovData resource of the "Unfallatlas" dataset and in the WMS `www.wms.nrw.de/wms/unfallatlas` AccessConstraints ("Dieses Werk ist lizensiert unter der Datenlizenz Deutschland - Namensnennung - Version 2.0"). Credited on the Sources page as "Source: Statistische Ämter des Bundes und der Länder, Unfallatlas, dl-de/by-2-0." No Stand line is required.
- **Coverage:** accidents with personal injury recorded by the police, only those whose place could be matched to a road section (well over 90 % in most Länder, per the WMS notes). Accidents with damage to property only are not in the data.
- **City filter:** `ags` is the city's 8-digit municipality key; a row's key is `ULAND` + `UREGBEZ` + `UKREIS` + `UGEMEINDE`. `agsPrefix` (`lib/unfallatlas.ts`) cuts it to the part to match: a kreisfreie Stadt by its Kreis (`05315000` → `05315`, Köln; `09162000` → `09162`, München), a city-state by its Land (`11000000` → `11`, `02000000` → `02`), since the file codes Berlin's Bezirke as `UKREIS` 01–12 and Hamburg's Bezirke and Stadtteile in `UREGBEZ`/`UKREIS`/`UGEMEINDE`.

2025 counts: Berlin 13,280 (32 killed, 1,628 seriously, 11,620 slightly injured; 4,767 with a bicycle, 1,778 with a pedestrian), Hamburg 7,057 (21 / 569 / 6,467), Köln 4,922 (13 / 575 / 4,334), München 5,264 (22 / 421 / 4,821). No row was dropped for an impossible value.

## What is kept

Each accident is a tuple `[lon, lat, severity, month, weekday, hour, kind, type, participants]` (`TrafficAccident` in `shared/types.ts`), coordinates rounded to 5 decimals: `UKATEGORIE` 1–3, `UMONAT`, `UWOCHENTAG` (1 Sunday … 7 Saturday), `USTUNDE` (the hour it began in), `UART` 0–9, `UTYP1` 1–7, and the `Ist*` flags as a bitmask (1 bicycle, 2 car, 4 pedestrian, 8 motorcycle, 16 goods vehicle, 32 other). The bit table exists twice, `ACCIDENT_PARTICIPANTS` in `lib/unfallatlas.ts` and in `components/map/layers/traffic-accidents.ts`: change both. Light and road conditions are not kept. Berlin's year is 466 KB of JSON, 130 KB gzipped; Hamburg 245 KB, Köln 168 KB, München 185 KB.

## Pipeline

- `cron/ingest-traffic-accidents.ts`, monthly on the 2nd at 05:00 (`0 5 2 * *`): reads `index.json`, takes the newest year's CSV archive (`newestUnfallatlasCsv`), downloads it once for all cities, and streams the CSV out of the ZIP (`lib/zip.ts`, stored or deflated members, no ZIP64) line by line, so the 42 MB never sit in memory as one string. About 0.4 s for the whole file. A new year (published each July) is picked up by the next run.
- A missing column throws and the job keeps the previous data; a city with no rows keeps its previous data with a warning. Writes `CK.trafficAccidents(city)` (`{city}:traffic-accidents`, TTL 37.2 days) and an `unfallatlas-accidents` snapshot each run. Retention: 7 days, newest row per city kept (`keepLatest`). `loadTrafficAccidents` has no age limit.
- `FRESHNESS_SPECS` max age 30 days. `GET /api/:city/traffic-accidents` → `{ data: TrafficAccidentData | null, fetchedAt }`, `Cache-Control: max-age=43200`, heavy-payload rate limit. Not in the bootstrap.

## Frontend

- Top-level `DataLayer` `'accidents'` (off by default, no number key), gated on the `trafficAccidents` city feature. The sidebar lists the filter (`accidentFilter` in `useCommandCenter`: `all`, `bike`, `pedestrian`) and `AccidentLegend`, which shares the map's query.
- `hooks/useTrafficAccidents.ts` fetches only while the layer is on, and never refetches (`staleTime: Infinity`).
- `components/map/layers/traffic-accidents.ts`: one GeoJSON source rebuilt for the filter, a `heatmap` layer (`accident-heat`, up to zoom 13, fading out from 12), a `circle` layer (`accident-circle`, from zoom 12, sorted by severity) and the killed-only `accident-fatal` circles below zoom 12. Popup handlers are registered once per map. Colours in `ACCIDENT_SEVERITY` (`components/map/constants.ts`). Month and weekday names come from Intl in the UI language (`popup-language.test.ts`).
- Synthetic data: twelve accidents per anchor for the year before, one killed per city (`synthetic/generate.ts`).

## Not added

- A tile (accidents per month or per 1,000 residents) and Stadtteil aggregation with the existing outlines: possible from the same rows, not built.
- Earlier years: the job keeps only the newest. The archives back to 2016 stay in the index (Berlin from 2018, NRW from 2019).
