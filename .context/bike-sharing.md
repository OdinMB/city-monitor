# Bike sharing

A map layer of bike-sharing stations for all four cities, each circle sized and coloured by the bikes available now (grey none, amber 1–2, green 3 or more), with the count written in from zoom 14. The popup shows the station, bikes available, free docks where the station has docks, when it last reported, and the system and operator. No dashboard tile: the map says it better than a city-wide total would. Added 2026-11-03.

## Sources (`dataSources.bikeSharing`)

One system per city, by provider; parsers in `packages/server/src/lib/bike-sharing-parsers.ts`.

| City | Provider | System | URL | Licence |
|---|---|---|---|---|
| Berlin | `gbfs` | nextbike Berlin | `gbfs.nextbike.net/maps/gbfs/v2/nextbike_bn/gbfs.json` | CC0-1.0 |
| Köln | `gbfs` | KVB-Rad (nextbike) | `…/nextbike_kg/gbfs.json` | CC0-1.0 |
| München | `gbfs` | MyRadl (nextbike) | `…/nextbike_ml/gbfs.json` | CC0-1.0 |
| Hamburg | `hamburg-sta` | StadtRAD Hamburg (DB Connect) | `iot.hamburg.de/v1.1` (SensorThings API) | dl-de/by-2.0 |

- **nextbike GBFS 2.3:** the job reads the auto-discovery file, then `station_information` and `station_status` (German feed list). The licence is the feed's own `license_id: "CC0-1.0"` in `system_information` (checked for bn, kg and ml on 2026-11-03). CC0 needs no credit; the Sources page names nextbike anyway. `ttl` is 60 s. The system codes come from `api.nextbike.net/maps/nextbike-live.json?list_cities=1`; the directory `gbfs.nextbike.net/maps/gbfs/v2/` itself answers 403.
- **StadtRAD:** one SensorThings query for every Thing with a datastream of service `HH_STA_StadtRad`, its Location and the newest observation of its `Fahrraeder` datastream (`stadtradThingsUrl`). About 365 Things in one page; `@iot.nextLink` is followed for up to 5 pages. Older Things also carry a retired datastream without a `layerName`, which the inner `$filter` drops. Observations are written when a station's count changes, so `reportedAt` is the time of the last change, not of the last check. The Transparenzportal datasets "StadtRAD-Stationen Hamburg" give dl-de/by-2.0, author Behörde für Verkehr und Mobilitätswende; credited as "Source: Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende, dl-de/by-2-0." The WFS `HH_WFS_Stadtrad` station list is not needed: the Things carry name and position.

## What is kept

- **Stations only.** GBFS `free_bike_status` (5,600 free-floating bikes in Berlin) is not read.
- **Inside the city's `boundingBox`.** MyRadl covers the Landkreis München too: of its ~800 stations, ~630 are in the box.
- **Installed and renting** (GBFS `is_installed`, `is_renting`).
- **Free docks only where they mean something:** a GBFS station with a `capacity` that is not virtual. nextbike reports 0 docks at virtual (dockless) stations and at stations without a capacity; Köln has 9 docked stations of 314, München none, Berlin nearly all. StadtRAD has no docks (`docks: null`).
- **StadtRAD stations silent for more than 30 days are dropped** (`STADTRAD_MAX_SILENCE_MS`): the API keeps Things of closed stations (one last changed in May 2025, three in March 2026).
- Coordinates rounded to 5 decimals.

Live counts on 2026-11-03 at 01:26 UTC: Berlin 1,068 stations / 2,380 bikes (148 KB JSON), Hamburg 357 / 3,827 (47 KB), Köln 314 / 636 (40 KB), München 627 / 3,769 (78 KB).

## Pipeline

- `cron/ingest-bike-sharing.ts`, every 5 minutes (`*/5`). Writes `CK.bikeSharing(city)` (`{city}:bike-sharing`, TTL 600 s) every run, and a `bike-sharing` snapshot to Postgres at most every 30 minutes per city (`BIKE_SHARING_DB_INTERVAL_MS`): the row serves only cache warming and the route's fallback, and Berlin's is ~150 KB. A failed request or an empty station list keeps the previous cache entry.
- `FRESHNESS_SPECS` max age is 1800 s to match the store interval; `loadBikeSharing` refuses rows older than 2 hours. Retention: 2 days, 100 rows per city.
- `GET /api/:city/bike-sharing` → `{ data: BikeSharingData | null, fetchedAt }`, `Cache-Control: max-age=120`, heavy-payload rate limit. Not in the bootstrap (over the ~50 KB line).

## Frontend

- `DataLayer` `'bike-sharing'` in the Traffic category (off by default), gated on the `bikeSharing` city feature (`lib/map-layers.ts`). The sidebar shows a three-colour legend under it (`BIKE_AVAILABILITY` in `components/map/constants.ts`).
- `hooks/useBikeSharing.ts` fetches only while the layer is on, refetching every 5 minutes.
- `components/map/layers/bike-sharing.ts`: a `circle` layer (`bike-station-circle`) and a count `symbol` layer from zoom 14; `bikeStationPopupHtml` follows the UI language (`popup-language.test.ts`).
- Synthetic data: four stations per anchor, docks only for a GBFS city (`synthetic/generate.ts`).

## Not added

- **Call a Bike** (DB Connect) through MobiData BW's GBFS: its feed states no `license_id`, unlike Flinkster on the same server; MobiData BW's dataset page says dl-de/by-2.0. Add it as a second system per city only once mobidata-bw@nvbw.de or DB Connect confirm (that needs `bikeSharing` to become a list).
- **Dott** (formerly TIER) public GBFS: no licence stated.
- **Lime, Voi, Bolt:** no public GBFS for these cities.
