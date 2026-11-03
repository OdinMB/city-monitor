# Official Air Quality Stations (UBA Air Data API)

Hourly readings of the state networks' official measuring stations, for all four cities, from the Umweltbundesamt's Air Data API v4. They sit in the existing air-quality map layer and tile; Open-Meteo (CAMS model), WAQI and Sensor.Community stay as they are ([weather.md](weather.md)).

## Source

- **API:** `https://luftdaten.umweltbundesamt.de/api/air-data/v4/` (the old `www.umweltbundesamt.de/api/air_data/v3` redirects here). No key. OpenAPI spec: `https://luftdaten.umweltbundesamt.de/modules/custom/w21_uba_air_data_api_v4/assets/uba_api_v4.yml`. `umweltbundesamt.api.proxy.bund.dev` mirrors it but was not reachable from the dev container.
- **Licence:** the spec's `info.license` is "Data licence Germany – attribution – version 2.0" (`dl-de/by-2-0`), and its description asks for the source line **"Umweltbundesamt mit Daten der Messnetze der Länder und des Bundes"**. Shown on the Sources page (`Umweltbundesamt Air Data API`, shared, gated on the `airQualityStations` feature), as the map source's attribution while the stations are drawn, in every station popup and under the tile's station list. Current-year data are not yet audited (final data each June) and may have gaps; the Sources entry says so.
- **Networks:** Berlin BLUME, Hamburger Luftmessnetz, LANUK NRW (LUQS), Bayerisches Landesamt für Umwelt (LÜB).
- **Times:** local German time (MEZ/MESZ, as the response's `meta.source` says); hours are keyed by their start and carry their end, "24:00:00" being midnight of the next day. `ubaLocalToIso` turns the end into UTC ISO. About one to two hours behind real time.

## Config

`dataSources.airQuality.ubaStations`: UBA station codes, in any order (the tile sorts). Checked 2026-11-03 against `/stations/json?use=airquality` (active = no "station active to"):

| City | Stations | Notes |
|---|---|---|
| Berlin | 15 (`DEBE010` … `DEBE127`) | all BLUME stations, 7 traffic |
| Hamburg | 14 (`DEHH008` … `DEHH083`) | Flughafen Nord and the two Finkenwerder stations sent no index values on 2026-11-03 and are left out until they do. The Schleswig-Holstein stations in the bounding box (Norderstedt, Barsbüttel) are not listed |
| Köln | 4 (`DENW053`, `DENW059`, `DENW211`, `DENW212`) | Hürth and Leverkusen lie outside the city |
| München | 5 (`DEBY037`, `DEBY039`, `DEBY089`, `DEBY115`, `DEBY189`) | |

A station UBA no longer lists is logged (`UBA lists no station …`); one without a reading in the window is left out silently. Re-check the list once a year (freshness inventory in [new-data-sources.md](new-data-sources.md)).

## Ingestion

`packages/server/src/cron/ingest-uba-air-quality.ts`, `10,40 * * * *` (UBA's hours arrive late and not at a fixed minute). Per run, for all cities together:

1. `GET /stations/json?use=airquality&lang=de` (~110 KB): `{ indices: [column names], data: { <id>: [row] } }`. `parseUbaStations` finds columns by name and keeps code, name, position, network code and station type (Verkehr → `traffic`, Hintergrund → `background`, Industrie → `industrial`).
2. `GET /airquality/json?date_from=…&time_from=…&date_to=…&time_to=24` with no station (all of Germany, ~250 KB for six hours): `data: { <station id>: { "<start>": [end, index 0–4, incomplete flag, [component id, value, index, decimal index]…] } }`. `parseUbaAirQuality` keeps each station's latest hour; components 5 NO₂, 1 PM10, 9 PM2.5, 3 O₃ (one-hour means in µg/m³, the same as `/measures` with `scope=2`; checked for PM10 at Wedding). The window starts six hours back on the German clock (`ubaWindowQuery`).
3. `toAirQualityStations` keeps the city's configured stations that have a reading.

Either request failing, or an unexpected format, leaves every city's previous list in place; a city with no readings keeps its previous list too. Cache `{city}:air-quality:stations`, TTL 7200 s; snapshot `uba-airquality` (2 days + row cap); `loadAirQualityStations` max age 6 h; in bootstrap as `airQualityStations` (about 3 KB for Berlin). Freshness spec max age 3600 s.

Shape (`AirQualityStation` in `shared/types.ts`): `code`, `name`, `lat`, `lon`, `setting`, `network`, `measuredAt` (end of hour, UTC), `index` (0–4 or null), `no2`, `pm10`, `pm25`, `o3` (µg/m³ or null when not measured; ozone is mostly at background stations).

## Endpoint

`GET /api/:city/air-quality/stations` → `{ data: AirQualityStation[] | null, fetchedAt }` (cache → Postgres → null), `Cache-Control: max-age=600`.

## Web

- **Feature** `airQualityStations` (server: `ubaStations` non-empty), in all four web configs. Not a picker topic: air quality is every city's topic already.
- **Hook** `useAirQualityStations(cityId, enabled)`, polls every 15 min, seeded from bootstrap.
- **Map** (`components/map/layers/air-quality.ts`, `updateUbaStationLayer`): on the air-quality layer, a landmark badge per station in the UBA class colour with the class name in the UI language (badge ids carry the language, so a language change redraws them). Popup (`ubaPopupHtml`): name, "Official measuring station · <type>", UBA index class, the measured components in µg/m³, the end of the hour on the city's clock and the UBA source line. While UBA stations are drawn, `withoutRelayedStations` hides WAQI points within 300 m of one, since WAQI relays the same stations; Sensor.Community points stay.
- **Tile** (`AirQualityStrip`): the headline AQI and scale bar stay the Open-Meteo/CAMS European AQI (the model's forecast). The four pollutant cards show, per pollutant, the mean of the newest hour over the official **urban background** stations (`measuredSummary`; all stations when a city had no background station), since traffic stations describe one street and not the city, with a caption naming the hour; a pollutant no station measured shows the model's value tagged "(model)". Without UBA data the caption says "Model forecast (CAMS)". The expanded tile lists every official station, worst class first, with the class name, a "Traffic" tag for traffic stations, and the source line; the WAQI station list shows only for a city without official stations.
- **Index colours** (`getUbaLevel` in `lib/aqi.ts`): very good `#50F0E6`, good `#50CCAA`, moderate `#F0E641`, poor `#FF5050`, very poor `#960032`, no index grey; dark text on all but very poor. A third scale: never colour a European or US AQI value with these, or the reverse.

## What became redundant

WAQI's stations in these four cities are the same state-network stations (WAQI relays them via the EEA and the networks; [weather.md](weather.md#waqi-terms-shown-live-not-archived-credited)), so for them WAQI adds nothing UBA lacks, and its terms forbid archiving. It still runs: it is the station source for a future city without a UBA config, and it was left in place on purpose. Removing it, or dropping `WAQI_API_TOKEN`, is the owner's call.

## Not built (yet)

- History: the snapshots are kept two days only. dl-de/by-2.0 allows archiving, so 24 h / 7 day sparklines per station could be built from a longer retention or a history endpoint.
- UBA's forecast (`/airqualityforecast/json?station=…`) answers but is unused.
- Around the autumn DST change the repeated local hour is converted with the winter offset.
