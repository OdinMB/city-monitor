# Telraam street counts (Berlin)

A sub-layer "Street counts (Telraam)" of Berlin's traffic map layer: one circle per street segment that a citizen-run Telraam sensor counted yesterday, sized by the vehicles counted and coloured by the share of bikes among them (bikes ÷ (bikes + cars + heavy vehicles): under 10 %, 10–25 %, 25–50 %, half or more). The popup gives the street and Ortsteil, the day and the hours counted, cars, bikes, pedestrians and buses/lorries with the change against the segment's usual value, the bike share, and links the segment on telraam.net. The sidebar shows a legend with the day, the number of sensors and a note that the sensors are residents'. Off by default, also when the traffic layer is turned back on. No dashboard tile. Added 2026-11-03.

## Source (`dataSources.telraamCounts`)

- **Files:** `https://berlin-zaehlt.de/csv/`, a directory listing with `bzm_telraam_segments.geojson` (870 KB, 293 segments in a box around Berlin, 242 of them in Berlin by their OSM address) and one `bzm_telraam_YYYY_MM.csv.gz` a month (about 1.3 MB; October 2026: 122 segments). All rebuilt each night at about 02:15 local time. Apache serves the `.gz` files with `Content-Encoding: gzip`, so `fetch` hands over plain CSV; `csvGzText` unpacks only when the body still starts with gzip's magic bytes.
- **CSV:** one row per segment and local hour (`date_local` "2026-11-02 07:00"), with `uptime` (share of the hour the sensor was up), `ped_total`, `bike_total`, `car_total`, `heavy_total` (bus, lorry, tractor), `v85` and a car-speed histogram. Telraam's own per-hour figures are already corrected for uptime. Cars include delivery vans; bikes include motorcycles (the GeoJSON's `column_map`).
- **Segments:** `properties.segment_id`, `osm.name` (string, sometimes an array of names, rarely null), `osm.address` with `ISO3166-2-lvl4` ("DE-BE"), `suburb` (Ortsteil) and `borough`. Geometry is a MultiLineString; the job takes the point halfway along its first line.
- **Licence:** CC BY 4.0: the folder's `LICENSE` file is the CC BY 4.0 text, and the datenregister.berlin.de package `berlin-zaehlt-mobilitaet` says `cc-by/4.0` (per the research of 2026-11-03; the datenregister API was rate-limited on re-check). Credited on the Sources page as "Source: Berlin zählt Mobilität / Telraam, CC BY 4.0." No Stand line is required. Telraam's own website terms cover its site material, not this dataset; no separate Telraam data licence was found on telraam.net, and third-party packages disagree (CC BY vs CC BY-SA), so the credit follows the publisher's licence.
- **Coverage and caveats:** citizen sensors in windows, so the streets are where volunteers live, not a network sample. Most older (V1) sensors count only in daylight, about 8 hours a day in November, newer S2 sensors 24 hours; daily totals of different segments are therefore not comparable with each other, only with the same segment's usual value. Hours of darkness count zero even with high uptime.

## What is kept

`TelraamCountsData` (`shared/types.ts`): the day counted (`date`, normally yesterday) and per segment `id`, `lon`/`lat` (5 decimals), `street`, `district`, the day's `cars`, `bikes`, `pedestrians`, `heavy`, `hours` (hours with uptime ≥ 0.5) and `usual`. A segment is listed when it had at least one such hour and counted anything (a covered or dark lens counts nothing).

`usual` is the median of each count over the same weekday in the four weeks before (`BASELINE_WEEKS`), from the days that segment counted, with `days` saying how many (at least 2). It is null when there were fewer, or when the day shown has fewer than 75 % of the usual hours (an outage would otherwise read as a drop). On 2026-11-02: 88 Berlin segments, 80 with a usual value, about 20 KB of JSON; hours from 3 to 23.

## Pipeline

- `cron/ingest-telraam-counts.ts`, at 04:25 and 11:25 (`25 4,11 * * *`; the second run catches a late rebuild). Per city with the source: the segment GeoJSON, then the month files covering yesterday and 28 days before (`telraamMonths`, one or two files; a 404 for the new month on the 1st is skipped). `addTelraamCsv` sums each region segment's hours per local date; `latestCountedDay` takes the newest day before today with any counts; `buildTelraamCounts` builds the list, busiest first. A failure (non-OK segment file, missing CSV column) keeps the previous data.
- Writes `CK.telraamCounts(city)` (`{city}:telraam-counts`, TTL 36 h) and a `telraam-counts` snapshot each run. Retention 7 days. `loadTelraamCounts` reads rows up to 3 days old.
- `FRESHNESS_SPECS` max age 1 day. `GET /api/:city/telraam-counts` → `{ data: TelraamCountsData | null, fetchedAt }`, `Cache-Control: max-age=3600`. Not in the bootstrap: the sub-layer is off by default.
- Kept apart from other counter sources on purpose: its own job, snapshot type, route and `TrafficSubLayer` (`telraam`), so official counter feeds can be added as their own sub-layers without touching it.

## Frontend

- `TrafficSubLayer` `'telraam'` in `useCommandCenter`, not in `ALL_TRAFFIC_SUBS`, so it starts off. `cityLayers` lists it where the city has the `telraamCounts` feature.
- `hooks/useTelraamCounts.ts` fetches only while the sub-layer is on (hourly refetch). `TelraamLegend` in `DataLayerToggles.tsx` shares the query.
- `components/map/layers/telraam-counts.ts`: one GeoJSON source, one `circle` layer (`telraam-circle`, sorted by vehicles, radius by vehicles and zoom, colour by `share` with `TELRAAM_BIKE_SHARE` from `map/constants.ts`). Usual values travel as flat properties (`usualCars` …), since MapLibre stringifies nested ones. The date is formatted by Intl in the UI language; strings under `mapPopup.telraam` and `sidebar.telraamLegend`.
- Synthetic data: two segments per anchor for yesterday, one without a usual value (`synthetic/generate.ts`).

## Not added

- A tile ("bikes vs cars yesterday" across the counted streets): possible from the same data; not built, since totals mix daylight-only and 24-hour sensors.
- Segment lines instead of points, `v85` speeds and the speed histogram, and the advanced classes (buses, vans, strollers) the GeoJSON describes but the CSV does not carry.
- Brandenburg segments in the files (outside Berlin's region filter).
