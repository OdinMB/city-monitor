# Source identifiers and licence checks

How to find the identifiers the Germany-wide sources need for a German city, how to confirm each one, and what to check before wiring a source that only one city has. Each "Confirm" URL is the request the job itself makes. Make them from a machine with internet access.

## Germany-wide sources

### PEGELONLINE gauges: `dataSources.waterLevels.stations`

- **Find:** `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?waters=RHEIN` lists every gauge on a river. `waters` takes the river's short name in capitals (`SPREE`, `ELBE`, `RHEIN`, `MAIN`). Each station has `uuid`, `shortname`, `longname`, `km`, `latitude`, `longitude` and `water.shortname`. Keep the gauges inside the city's bounding box.
- **Fill:** `{ uuid, name: <gauge name>, waterBody: <river> }`, plus `tidal: true` where the gauge's characteristic values are MThw/MTnw rather than MHW/MNW (Hamburg's Elbe gauges; `.context/water-levels.md`, "State Derivation").
- **Confirm:** `…/stations.json?ids=<uuid>&includeTimeseries=true&includeCurrentMeasurement=true&includeCharacteristicValues=true` (`ingest-water-levels.ts`) returns the station with a current measurement.
- **Licence:** DL-DE-Zero (`.context/water-levels.md`). Add the city's gauges to that file's city list.

### NINA warnings: `dataSources.nina.ars`

- **Find:** NINA wants the 12-digit Amtlicher Regionalschlüssel (ARS) at district level: the first five digits of the city's ARS, then seven zeros. For a kreisfreie Stadt those five digits are its own district (Köln, AGS `05315000`, gives `053150000000`). A city-state is its state key and zeros (Berlin `110000000000`, Hamburg `020000000000`). A city inside a Landkreis gets the warnings for its whole Landkreis. The keys are in Destatis' Gemeindeverzeichnis and in the Regionalschlüssel list linked from the NINA API documentation (github.com/bundesAPI/nina-api).
- **Confirm:** `https://warnung.bund.de/api31/dashboard/<ars>.json` (`ingest-nina.ts`) answers 200 with a JSON array, often empty. `config.test.ts` checks the key has 12 digits.

### DWD pollen: `dataSources.pollen`

- **Find:** `https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json`. Each entry of `content` has `region_id`, `region_name`, `partregion_id` and `partregion_name`. Pick the part-region the city lies in; a region without part-regions has `partregion_id: -1` (Berlin: 50 / -1).
- **Confirm:** the pair appears in that file. `ingest-pollen.ts` matches both IDs and logs "No pollen data for <id>" when none matches.
- **Licence:** CC BY 4.0 (`.context/pollen.md`). Add the city to that file's "Region Mapping".

### DWD warnings: matched by `name`

- **How it matches:** `fetchDwdAlerts` in `ingest-weather.ts` keeps a warning when its `regionName` contains the city's `name` (case-insensitive). Regions are DWD warn cells at district level, such as "Stadt Köln".
- **Find:** DWD's list of warn cells (`cap_warncellids_csv.csv`, linked from DWD's open-data help pages on warnings) names every cell. Find the city's row (Köln: `105315000`, "Stadt Köln") and check that `name` is contained in it.
- **Watch for:** a surrounding district named after the city (a "Landkreis <name>") contains the name too, so the city also shows that district's warnings.
- **Confirm:** `warnings.json` lists only regions with a warning in force, so neither it nor `check:weather` can confirm the name. The warn-cell list can.

### DWD UV index: matched by `name`

- **How it matches:** `parseDwdUv` in `ingest-weather.ts` takes the entry of `https://opendata.dwd.de/climate_environment/health/alerts/uvi.json` whose `content[].city` equals the city's `name` (case-insensitive).
- **Find:** DWD forecasts UV for a few dozen cities only. A city missing from `content` gets no UV row; that is not an error to work around.
- **Confirm:** `npm run check:weather -- --city <id>` (from `packages/server/`) fails with `no entry for "<name>"` when the name is missing.

### Sources that need no identifier

- **BrightSky weather and Open-Meteo air quality** use `dataSources.weather` lat/lon. `check:weather` confirms both.
- **WAQI stations** come from the bounding box (`ingest-air-quality-grid.ts`, needs `WAQI_API_TOKEN`). Add the city's agencies to `WAQI_AGENCIES`: the Umweltbundesamt and the state's monitoring network, checked against the stations' aqicn.org pages (`.context/weather.md`, "Credit"). Sensor.Community stations (`airQuality.sensorCommunityStations`) are optional.
- **TomTom traffic** queries the bounding box (`ingest-traffic.ts`, needs `TOMTOM_API_KEY`).
- **AEDs** query Overpass by `name`, at state level only (SKILL.md, "City-state assumptions").
- **Emergency pharmacies** search aponet.de by one central postcode: `CITY_PLZ` (`city-keyed-code.md`).
- **Bundestag members** come from abgeordnetenwatch.de, filtered by a constituency or list label that contains `name`, and only for a city in `PARLIAMENT_CONFIG`.

`.context/` has no licence note yet for NINA, aponet.de, Overpass, TomTom or abgeordnetenwatch.de. Berlin already uses them, so a new city adds no new terms. If you look a licence up, record it in the source's `.context` file.

## Licence check for city-specific sources

Check every source that only this city has before you wire it: news RSS (`feeds`), police press releases (`dataSources.police`, such as presseportal.de), transit (`transit`), events (`events`), council meetings (`councilMeetings`, OParl), roadworks (`roadworks`), district GeoJSON, a noise WMS, labour-market district tables, bathing water, wastewater, Bürgeramt appointments, budget, population and social-atlas data.

1. Read the terms: the site's terms of use or the open-data portal's licence, `robots.txt`, and any licence file it links (an RSL file such as `/rsl.xml`).
2. **Feeds and police press releases are AI input.** Every item goes through the LLM classifier, and police reports through place extraction (`.context/ai-transparency.md`, features 2 to 4). A source whose terms forbid AI input is out, however good the feed: BZ Berlin was removed for this (`.context/news.md`, "Feed status"). Items are also stored, so note non-commercial and no-archiving clauses (the rbb24 note there).
3. **Everything else:** check redistribution, archiving and attribution. WAQI is the model: shown live, never archived, its agencies credited (`.context/weather.md`).
4. Record the licence in the source's `.context` file and credit the source in the city's `CITY_SOURCES` entry.
5. Probe a feed with Node's `fetch`, not curl: some CDNs answer curl with 403 (`.context/news.md`).

Then wire it:

- Many jobs parse one provider's format (`roadworks` reads VIZ Berlin's JSON, `budget` is `berlin-doppelhaushalt`, `appointments` is `service-berlin`, `socialAtlas` is `mss-wfs`). Read the job before you point it at another city's URL. A new format is a new data source: follow `.context/new-data-sources.md`.
- A feed needs its favicon (`FAVICON_SLUGS`, `FAVICON_SOURCES`; `.context/news.md`, "Favicons").
- A host the browser loads from needs the CSP in `render.yaml` and `SERVICES` in `PrivacyPage.tsx`.
- Feeds or police reports for a new city mean AI text served for it: check `.context/ai-transparency.md` still describes what is served, in the same change.
