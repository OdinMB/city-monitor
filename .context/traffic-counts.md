# Traffic flow and traffic counts

Two additions to the existing **traffic** map layer, built for Hamburg on 2026-11-03 and config-driven so other cities can join:

- **Congestion (live)**: a raster overlay of the road network's current state (flowing, heavy, slow-moving, jammed). Frontend only, like the noise and rent WMS layers.
- **Car counts** and **Bicycle counts**: a circle per counting site, coloured by the last full hour's count against what the site usually counts in that hour of that weekday.

They are sub-layers of `traffic` next to the TomTom incidents (which every city has, `ingest-traffic`, snapshot `tomtom-traffic`: accidents, closures, jams and roadworks as lines, no flow data), public transport and roadworks. None of them is on by default (`DEFAULT_TRAFFIC_SUBS` in `useCommandCenter.ts`): the congestion lines would crowd the incident lines, and the counts are only fetched once asked for. No dashboard tile.

## Congestion map (WMS, `trafficFlowMap`)

- **Source:** `https://geodienste.hamburg.de/wms_hh_verkehrslage`, layer `verkehrslage` ("WMS Verkehrslage Hamburg", LGV). Recomputed every 5 minutes; covers Hamburg and the motorways towards Lüneburg, Bremen, Flensburg and Lübeck. The dataset is `verkehrslage-hamburg*` on the Transparenzportal.
- **Licence:** GetCapabilities `<Fees>`: "Datenlizenz Deutschland Namensnennung 2.0, Quellenvermerk: Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende" (checked 2026-11-03). Credited in the map attribution and on the Sources page.
- **Scale:** the service returns empty tiles at zoom 11 (1:270,000) and draws from zoom 12, so the raster source gets `minzoom: 12` and the sidebar says "zoom in" under the legend. Hamburg opens at zoom 11.
- **Freshness:** the service answers `Cache-Control: no-cache`. MapLibre keeps tiles it has, so `CityMap` keeps a refresh counter (`TRAFFIC_FLOW_REFRESH_MS`, 5 min) while the sub-layer is on, and `setTrafficFlowOverlay` (`map/base.ts`) swaps the tile URL (`&t=<counter>`) with `setTiles`, which reloads the tiles without removing the layer.
- **Legend:** `TRAFFIC_FLOW_WMS.hamburg.legend`, colours sampled from the service's GetLegendGraphic (fliessend `#2ca62c`, dicht `#e88528`, zäh `#e70104`, gestaut `#971718`).
- **Placement:** under the TomTom incident lines and roadworks, which say why a road is slow.
- **Config:** a city lists the web-only feature `trafficFlowMap` exactly when it has an entry in `TRAFFIC_FLOW_WMS` (`config/index.test.ts`). The browser loads the tiles from `geodienste.hamburg.de`, which the CSP in `render.yaml` and `SERVICES` in `PrivacyPage.tsx` already name for the noise and rent maps.
- **Not built:** the same data as a WFS (`wfs_hh_verkehrslage`, ~17,500 line segments with `zustandsklasse`, `strassenklasse`, `zeitstempel_utc`; vector lines and a jam-length tile would need the server), and the 10-minute forecast ("Verkehrslageprognose Hamburg", FROST server).

## Counting sites (`dataSources.trafficCounts`)

```ts
trafficCounts: { provider: 'hamburg-sta', url: 'https://iot.hamburg.de/v1.1', sitesWfsUrl: 'https://geodienste.hamburg.de/HH_WFS_Verkehrszaehlstellen', modes: ['car', 'bike'] }
```

`modes` gives the city features `carCounts` and `bikeCounts` (`lib/city-features.ts`), each a sub-layer. A city with bicycle counters only lists `['bike']`. One parser module per provider: `lib/traffic-count-parsers.ts`.

### Hamburg's counters

- **Data:** the infrared counters ("Verkehrsdaten Kfz (Infrarotdetektoren) Hamburg" and "Verkehrsdaten Rad (Infrarotdetektoren) Hamburg" on the Transparenzportal, dl-de/by-2.0, Behörde für Verkehr und Mobilitätswende; checked 2026-11-03). Each SensorThings Thing is one direction ("Verkehrszählstelle 0242982", `richtung` "West nach Ost") with datastreams at 5 min, 15 min, 1 hour, 1 day and 1 week. Its datastreams' `properties.assetID` is the 4-digit site ("0242"), a junction or road section. Retired series end in "(veraltet)".
- **Which series:** the hourly ones, found by name (`startswith(name,'Kfz-Aufkommen an Verkehrszählstelle') and endswith(name,'im 1-Stunde-Intervall')`, and `Fahrrad-Aufkommen …` for bicycles). A name filter answers in about a second; the same filter on `properties/serviceName` and `layerName` took 50 s per 100. On 2026-11-03: 829 car counters at 179 sites, 313 bicycle counters at 83 sites, all in one page.
- **Delivery:** an hour's value appears a few minutes after the hour for most counters (checked: the hourly value equals the sum of its four 15-minute values), but a third of them lag by an hour or more, and some stop for days.
- **Two requests per mode per run:**
  1. Every hourly counter with its Thing's location and newest observation (`hamburgLatestUrl`, ~580 KB for cars).
  2. The same counters' observations in the hour shown and in the same local hour on the same weekday in each of the four weeks before (`hamburgHoursUrl`, an `or` of five `phenomenonTime` windows; ~11 s for cars).
- **The hour shown** (`pickCountHour`): the newest hour start that two thirds of the counters heard from in the last 6 hours have reached. Counters without a value in that hour are left out.
- **The usual count:** per counter, the median of the reference weeks it has, if at least two (`MIN_REFERENCES`). The weeks go back in local time (`referenceHours`): across a clock change a week is 167 or 169 hours.
- **Per site** (`aggregateSites`): the sum over its counters. Where some counters have a usual count, only those are summed on both sides, so count and usual count cover the same directions; where none has, the site shows its count without a comparison. Position: the middle of its counters' locations. All directions at a junction are added up, so a site's count is not the number of vehicles passing through it; the comparison with its own usual count is what the colour shows.
- **Names:** the Verkehrszählstellen WFS lists sites with `zaehlstelle` and `bezeichnung` ("Shanghaiallee / Überseeallee"): `app:kfz_zaehlstellen` (~1.1 MB, includes manual counting sites) and `app:radverkehr_zaehlstellen` (~0.4 MB). Read once a day per city (`SITE_NAMES_MAX_AGE_MS`); a mode's own list first, then the other. About 32 of 179 car sites are on neither list and show "Counting site 0203". `propertyName` is ignored by this WFS.

Live run on 2026-11-03 at 01:58 UTC: 171 car and 79 bicycle sites, all compared, 139 car and 79 bicycle sites named, 46 KB JSON, 5.7 s.

### Pipeline

- `cron/ingest-traffic-counts.ts`, every 15 minutes (`*/15`). Writes `CK.trafficCounts(city)` (`{city}:traffic-counts`, TTL 1800 s) every run, and a `traffic-counts` snapshot when the hour shown changes. A mode whose requests fail keeps its last sites from the cache.
- `FRESHNESS_SPECS` max age 7200 s; `loadTrafficCounts` refuses rows older than 3 hours. Retention: 2 days, 100 rows per city.
- `GET /api/:city/traffic-counts` → `{ data: TrafficCountData | null, fetchedAt }`, `Cache-Control: max-age=300`, heavy-payload rate limit. Not in the bootstrap.

### Frontend

- `hooks/useTrafficCounts.ts` fetches only while a counts sub-layer is on, refetching every 15 minutes.
- `components/map/layers/traffic-counts.ts`: a `circle` layer (`traffic-count-circle`; bicycle sites with a dark ring, car sites a white one) and a count label from zoom 14. `trafficCountPopupHtml` shows the site, the mode, the count, the usual count with the difference in percent, the hour (local time) and the number of counters; it follows the UI language (`popup-language.test.ts`).
- Colours: `TRAFFIC_COUNT_LEVELS` in `map/constants.ts`, by count / usual: below 0.6 far less (dark blue), below 0.85 less (light blue), below 1.15 as usual (grey), below 1.4 more (orange), above far more (red). Light grey where there is no usual count, or the usual count is below 50 cars or 10 bicycles an hour (`TRAFFIC_COUNT_MIN_TYPICAL`): at night a few vehicles more or less would swing the colour. The sidebar shows the legend under the traffic sub-layers.
- Synthetic data: two sites per anchor and mode, one without a usual count (`synthetic/generate.ts`; Hamburg only, `NOT_IN_BERLIN`).

## Not added

- A "cycling today" tile (yesterday's bicycle total against the same weekday a week before, from the daily series): the map's per-site comparison came first.
- The counters' 15-minute series, which would be fresher but noisier.
- Berlin's counters (Telraam "Berlin zählt Mobilität", the Senate's bicycle counters, VIZ detectors) and München's and Köln's bicycle counters: each needs its own provider in `traffic-count-parsers.ts` and a `dataSources.trafficCounts` entry.
