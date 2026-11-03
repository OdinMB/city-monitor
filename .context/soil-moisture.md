# Soil moisture (drought tile) and Gieß den Kiez

Since 2026-11-03 every city's dashboard has a **Soil Moisture** tile: how much of the water the soil can hold for plants is there now, at the city's DWD climate stations, with a plain-language level, the trend and the last 90 days. Berlin's tile adds the street-tree waterings residents log on Gieß den Kiez.

## Sources

### DWD soil moisture per station (CC BY 4.0)

- **Files:** `https://opendata.dwd.de/climate_environment/CDC/derived_germany/soil/daily/recent/derived_germany_soil_daily_recent_v2_<Stationsindex>.txt.gz`, one per station, gzip'd semicolon text with a header row. "Berechnete aktuelle Tageswerte von charakteristischen Elementen aus dem Boden und dem Pflanzenbestand", v2; the description is `BESCHREIBUNG_derived_ermany_soil_daily_recent_de_v2.pdf` (sic) in the same folder, the station list `derived_germany_soil_daily_recent_stations_list.txt`.
- **What it is:** model output of the DWD's agrometeorological model AMBAV, driven by the station's weather, not a measurement. The `recent` file runs from 1 January of the current year to one or two days ago (on 2026-11-03: 2026-01-01 to 2026-11-01, 305 rows, regenerated around 09:00 UTC).
- **Columns read:** `Datum` (YYYYMMDD), `BFGS_AG` (soil moisture under grass, 0–60 cm, sandy soil: loamy sand, field capacity 17 vol%) and `BFGL_AG` (the same on loamy silt, field capacity 37 vol%), both in **% nFK** (% of usable field capacity). Values above 100 occur (the soil holds more than it can keep, mostly on loamy silt in winter). Missing values would be `-999`; `parseDwdSoilFile` skips such a day. The file also has soil temperatures, frost depth, the six 10-cm layers of BFGL, winter wheat and maize variants and evapotranspiration; none of those are used.
- **Licence:** dwd.de "Rechtliche Hinweise": free geodata may be reused under CC BY 4.0 with a source note. The DWD's "Vorgaben für die Gestaltung des DWD-Quellenvermerks" ask for "Quelle: Deutscher Wetterdienst" next to the data, and for processed data suggest notes such as "Datenbasis: Deutscher Wetterdienst, Einzelwerte gemittelt". The tile footer shows the latter where it averages several stations and the plain note for a single station, with a CC BY 4.0 link; the Sources page entry "DWD Soil Moisture (Climate Data Center)" says "Source: Deutscher Wetterdienst, CC BY 4.0."
- **Stations** (`dataSources.soilMoisture.stations`, checked 2026-11-03):

| City | Stations | 2026-11-01, sandy / loamy |
|---|---|---|
| Berlin | 433 Berlin-Tempelhof, 403 Berlin-Dahlem (FU), 400 Berlin-Buch | 34/29, 45/51, 43/42 (mean 40.7 % sandy: dry) |
| Hamburg | 1975 Hamburg-Fuhlsbüttel, 1981 Hamburg-Neuwiedenthal | 97/116, 97/111 |
| Köln | 2667 Köln/Bonn (airport, Porz) | 97/113 |
| München | 3379 München-Stadt (1262 München-Flughafen is outside the city) | 53/47 |

### Gieß den Kiez watering data (Berlin, CC0)

- **File:** `https://raw.githubusercontent.com/technologiestiftung/giessdenkiez-de-opendata/main/daten/giessdenkiez_bew%C3%A4sserungsdaten.csv` (`dataSources.soilMoisture.treeWatering.csvUrl` in `berlin.ts`), every watering logged on giessdenkiez.de since 2020, about 8.3 MB and 61,500 rows in 2026-11. Openly downloadable, no key. A GitHub Action of the repo regenerates it from the app's database; its README says at the start of each month during the growing season (March–September), but on 2026-11-03 it held rows up to 2026-10-31.
- **Columns:** `id` (the tree's "Technischer Schlüssel", as in Berlin's tree cadastre), `lng`, `lat`, `bezirk`, `art_dtsch`, `gattung_deutsch`, `strname`, `pflanzjahr`, `timestamp` (day resolution, "2026-10-01 00:00:00+00:00"), `bewaesserungsmenge_in_liter`. Semicolons, no quoting seen. `parseWateringCsv` reads `id`, `bezirk`, `timestamp` and the litres, skipping rows without a date or a positive amount; it throws when one of the columns it needs is gone.
- **Licence:** daten.berlin.de dataset `gdk-nutzungsdaten` ("Gieß den Kiez - Nutzungsdaten", Open Data Informationsstelle): **cc-zero**. No credit is required; the Sources page names the Technologiestiftung Berlin / CityLAB as a courtesy, and the expanded tile links giessdenkiez.de.
- **Volume:** 2026: 3,674 waterings, 157,917 litres, 1,008 trees; 2025: 4,630 waterings, 170,152 litres. The last 30 days of data to 2026-10-31: 141 waterings, 4,238 litres, 70 trees.

## Ingestion (`cron/ingest-soil-moisture.ts`)

- **Job:** `ingest-soil-moisture`, `30 10,16 * * *` (after the DWD's morning regeneration, the afternoon run for a late file). For each active city with `dataSources.soilMoisture.stations`: one gzip download per station (30 s timeout), then for a city with `treeWatering` the CSV (90 s timeout).
- **Aggregation:** `meanHistory` averages the stations per day over the days every fetched station has (so one station's gap doesn't make the mean jump) and keeps the last 90 (`HISTORY_DAYS`), one decimal. Each station's newest day is kept as is. `summarizeWatering` takes the newest logged day (`dataThrough`, ignoring days after today) and sums litres, waterings and distinct trees for the 30 days up to it, its calendar year (`season`) and the year before (`previousSeason`), plus the year's top three Bezirke by litres.
- **Failures:** a failed station is left out of that run (logged); if every station fails, the last run's readings stay (and nothing is written for a city that never had any). A failed CSV keeps the last run's watering figures.
- **Storage:** snapshot type `dwd-soil-moisture` (about 5 KB per city), cache key `{cityId}:soil-moisture` with a 48 h TTL (`SOIL_MOISTURE_TTL_SECONDS`), in the bootstrap. `loadSoilMoisture` refuses rows older than 7 days; retention 7 days.
- **Endpoint:** `GET /api/:city/soil-moisture` (`cacheFor(3600)`), `{ data: SoilMoistureData | null, fetchedAt }`:

```ts
SoilMoistureData {
  stations: Array<{ id; name; date; sandy; loamy }>; // each station's newest day
  history: Array<{ date; sandy; loamy }>;            // the stations' mean, 90 days, oldest first
  watering: TreeWateringSummary | null;              // Berlin only
}
TreeWateringSummary { dataThrough; last30Days; season: {…, year}; previousSeason: {…, year}; topDistricts }
// each period: { litres, waterings, trees }
```

## Tile (`SoilMoistureStrip.tsx`, `lib/soil-moisture.ts`)

- **Gating:** feature `soilMoisture` (server: `stations.length > 0`), and `treeWatering` (server: also `treeWatering` set) for the Gieß den Kiez parts. Both are in `CityFeature`; the web configs list them and the parity test checks them.
- **Headline:** the stations' mean on sandy soil, in % with the day ("41% of the water the soil can hold for plants, under grass on sandy soil, Nov 1"). Sandy soil because it dries first and is closest to Berlin's sands and street-tree pits; loamy soil is shown in the expanded tile.
- **Level** (`soilMoistureLevel`, sandy value): < 30 very dry (drought stress, the agrometeorological threshold), 30–49 dry, 50–79 adequate, 80–99 moist, ≥ 100 wet, each with a one-line hint. Colours: red, amber, green, sky, blue.
- **Trend:** the change in percentage points against 7 and 30 days before the newest day (`changeOver`), with an arrow. A day missing from the history leaves that figure out.
- **Expanded:** the 90-day sparkline (0–100 % scale, dashed marks at 30 and 50 %), the loamy-soil value, each station's newest value and day, and a note on what % nFK is. For Berlin, the Gieß den Kiez section: litres, trees and waterings in the 30 days to the newest day, this year and last year, the top Bezirke, and that the file is published about monthly. When the 30 days hold no watering (winter), it says so and that the season runs from spring to autumn. The collapsed tile shows a one-line watering teaser when there were waterings.
- **No off-season:** the model runs all year; winter values are simply high. Frozen soil is not flagged.
- **Freshness:** `FEED_TIMINGS.soilMoisture` uses the job's longer gap (18 h). The data itself lags the DWD by a day or two; the headline always shows its day.

## Not done

- No map layer: the values are per station, not per area. The UFZ Dürremonitor grids would allow one but are not openly licensed (permission needed).
- No soil temperature, frost depth or evapotranspiration, though the same file has them.
- Gieß den Kiez's per-tree points (and the GeoJSON twin) are not shown on the map; the tree cadastre layer they would join does not exist yet.
