# Source identifiers and licence checks

How to find the identifiers the Germany-wide sources need for a German city, how to confirm each one, and what to check before wiring a source that only one city has. Each "Confirm" URL is the request the job itself makes. Make them from a machine with internet access.

## Germany-wide sources

### PEGELONLINE gauges: `dataSources.waterLevels.stations`

- **Find:** `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?waters=RHEIN` lists every gauge on a river. `waters` takes the river's short name in capitals (`SPREE`, `ELBE`, `RHEIN`, `MAIN`). Each station has `uuid`, `shortname`, `longname`, `km`, `latitude`, `longitude` and `water.shortname`. Keep the gauges inside the city's bounding box.
- **Fill:** `{ uuid, name: <gauge name>, waterBody: <river> }`, plus `tidal: true` where the gauge's characteristic values are MThw/MTnw rather than MHW/MNW (Hamburg's Elbe gauges; `.context/water-levels.md`, "State Derivation").
- **Confirm:** `…/stations.json?ids=<uuid>&includeTimeseries=true&includeCurrentMeasurement=true&includeCharacteristicValues=true` (`ingest-water-levels.ts`) returns the station with a current measurement.
- **Licence:** DL-DE-Zero (`.context/water-levels.md`). Add the city's gauges to that file's city list.

### LHP flood gauges: `dataSources.floodStatus` (rivers PEGELONLINE lacks)

- **Find:** `curl -H 'Accept: application/json' 'https://api.hochwasserzentralen.de/public/v1/data/stations?states=BY'` lists the state's flood gauges (`id`, `name`, `water`, `coordinates`); `states` takes the two-letter code. Take the city's gauge and at most one upstream.
- **Fill:** `{ provider: 'lhp', state, stations: [{ id, name, waterBody }, { …, upstream: true }] }`, and `floodStatus` in the web `features`; add the LHP credit to the city's Sources list (`.context/water-levels.md`, "Flood Status (LHP)").
- **Confirm:** the ids are in that response with a `timestamp`; `ingest-flood-status` logs "LHP lists no gauge …" otherwise.
- **Licence:** CC BY 4.0 with a fixed credit, the "Stand" and a 10-minute refresh, all handled by the tile.

### NINA warnings: `dataSources.nina.ars`

- **Find:** NINA wants the 12-digit Amtlicher Regionalschlüssel (ARS) at district level: the first five digits of the city's ARS, then seven zeros. For a kreisfreie Stadt those five digits are its own district (Köln, AGS `05315000`, gives `053150000000`). A city-state is its state key and zeros (Berlin `110000000000`, Hamburg `020000000000`). A city inside a Landkreis gets the warnings for its whole Landkreis. The keys are in Destatis' Gemeindeverzeichnis and in the Regionalschlüssel list linked from the NINA API documentation (github.com/bundesAPI/nina-api).
- **Confirm:** `https://warnung.bund.de/api31/dashboard/<ars>.json` (`ingest-nina.ts`) answers 200 with a JSON array, often empty. `config.test.ts` checks the key has 12 digits.

### DWD pollen: `dataSources.pollen`

- **Find:** `https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json`. Each entry of `content` has `region_id`, `region_name`, `partregion_id` and `partregion_name`. Pick the part-region the city lies in; a region without part-regions has `partregion_id: -1` (Berlin: 50 / -1).
- **Confirm:** the pair appears in that file. `ingest-pollen.ts` matches both IDs and logs "No pollen data for <id>" when none matches.
- **Licence:** CC BY 4.0 (`.context/pollen.md`). Add the city to that file's "Region Mapping".

### DWD warnings: `dataSources.weather.dwdWarnRegion`, else `name`

- **How it matches:** `fetchDwdAlerts` in `ingest-weather.ts` keeps a warning from the city's warn regions (`cityWarnRegions` in `lib/dwd-warnings.ts`). With `dwdWarnRegion`, that is the one region whose `regionName` equals it (case-insensitive); without, every region whose `regionName` contains the city's `name`. Regions are DWD warn cells at district level, such as "Stadt Köln".
- **Find:** DWD's live district warn regions, the `dwd:Warngebiete_Kreise` layer: `https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=dwd:Warngebiete_Kreise&outputFormat=application/json&propertyName=WARNCELLID,NAME&CQL_FILTER=NAME%20LIKE%20%27%25<city>%25%27` (Köln: `105315000` "Stadt Köln"; München: `909184999` "Kreis und Stadt München"). Don't go by `cap_warncellids_csv.csv`: it dates from January 2023 and lists cells warnings no longer use (a "Stadt München", `109162000`).
- **Fill:** a kreisfreie Stadt can share its name with the Landkreis around it, whose warnings a name match would take in, so set `dwdWarnRegion` to the city's own region name, as Köln does. Where DWD warns for city and Landkreis in one region (München, Augsburg, Regensburg), name that joint region, as München does. A city-state (Berlin, Hamburg) leaves it out and matches by `name`, which also takes in the cells it is split into.
- **Confirm:** `warnings.json` lists only regions with a warning in force, so neither it nor `check:weather` can confirm the name. The `dwd:Warngebiete_Kreise` layer can; so can a day with a warning in force there, when `check:weather` counts it under the region.

### DWD UV index: matched by `name`

- **How it matches:** `parseDwdUv` in `ingest-weather.ts` takes the entry of `https://opendata.dwd.de/climate_environment/health/alerts/uvi.json` whose `content[].city` equals the city's `name` (case-insensitive).
- **Find:** DWD forecasts UV for a few dozen cities only. A city missing from `content` gets no UV row; that is not an error to work around.
- **Confirm:** `npm run check:weather -- --city <id>` (from `packages/server/`) fails with `no entry for "<name>"` when the name is missing.

### Sources that need no identifier

- **BrightSky weather and Open-Meteo air quality** use `dataSources.weather` lat/lon. `check:weather` confirms both.
- **WAQI stations** come from the bounding box (`ingest-air-quality-grid.ts`, needs `WAQI_API_TOKEN`). Add the city's agencies to `WAQI_AGENCIES`: the ones the stations' aqicn.org pages credit, usually the state's monitoring network and, where it relays them, the European Environment Agency (list the stations with `api.waqi.info/mapq/bounds` for the bounding box) (`.context/weather.md`, "Credit"). Sensor.Community stations (`airQuality.sensorCommunityStations`) are optional.
- **TomTom traffic** queries the bounding box (`ingest-traffic.ts`, needs `TOMTOM_API_KEY`).
- **AEDs** query Overpass for the boundary whose `name` is the city's and whose `admin_level` is `dataSources.aeds.adminLevel`, 4 (a state) without it (SKILL.md, "City-state assumptions"). In German OpenStreetMap a kreisfreie Stadt is 6. Confirm that the area exists and holds defibrillators: `curl -s https://overpass-api.de/api/interpreter --data-urlencode 'data=[out:json][timeout:25];area["name"="Köln"]["admin_level"="6"]["boundary"="administrative"]->.s;node["emergency"="defibrillator"](area.s);out count;'` answers with a count above 0 (the query `ingest-aeds.ts` sends, counting instead of listing). A Landkreis named after the city has a longer name ("Landkreis München"), so the exact name keeps it out.
- **Emergency pharmacies** search aponet.de by one central postcode: `CITY_PLZ` (`city-keyed-code.md`).
- **Labour market** (`dataSources.laborMarket`): the Bundesagentur's Eckwertetabelle for the Land (city-state) or the Kreis (kreisfreie Stadt) (SKILL.md, "City-state assumptions"). The official names are in `https://statistik.arbeitsagentur.de/Auswahl/Layout/Statistiktabellen/JS/DR-LZR-persistListenfelderJSON.js` ("Köln, Stadt", "München, Landeshauptstadt"). Confirm with `curl -s 'https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/csv/EckwerteTabelleALOKr?Kreis=K%C3%B6ln%2C%20Stadt'`: it answers with `Kreis:; Köln, Stadt` and eight rows starting at "Arbeitslose insgesamt" (the name URL-encoded, as `baTableUrl` sends it). The CSV footer allows passing the data on with the source named and a link to statistik.arbeitsagentur.de; add `baSource('<area>')` to the city's list in `SourcesPage.tsx`.
- **Wastewater** (`dataSources.wastewater`): RKI AMELAG's treatment plants (CC BY 4.0). List the plants of the city's state with `curl -s https://raw.githubusercontent.com/robert-koch-institut/Abwassersurveillance_AMELAG/main/amelag_einzelstandorte.tsv | awk -F'\t' '$2=="NW"{print $1"\t"$9}' | sort -u` (state code in `bundesland`, people served in `einwohner`; the file is over 50 MB) and take those named after the city (`Hamburg 01`, `Hamburg 02`, `Köln`, `München`). Check each has recent `Influenza A`, `Influenza B`, `RSV A+B` or `RSV A/B` and `SARS-CoV-2` samples; a plant whose RSV is spelt otherwise needs an entry in `AMELAG_PATHOGENS` (`ingest-wastewater.ts`). Set `{ provider: 'amelag', sites: [...] }` and add `amelagSource('<plants>')` to the city's list in `SourcesPage.tsx`.
- **Bundestag and state parliament members** come from abgeordnetenwatch.de (API v2, CC0 1.0 as its responses' `meta` states), only for a city in `PARLIAMENT_CONFIG`. A city-state is matched by `name`; a city inside a state needs its `constituencies` (SKILL.md, "City-state assumptions"). Find the state parliament's id in `/api/v2/parliaments`, its current legislature in `/api/v2/parliament-periods?parliament=<id>&sort_by=start_date_period&sort_direction=desc`, and the constituency labels in `/api/v2/candidacies-mandates?parliament_period=<period>&type=mandate&range_end=1000` (`electoral_data.constituency.label`); curl answers where Node's `fetch` might not, and both did on 2026-11-01. Compare the list with the Landeswahlleiter's constituency list: a constituency where no candidate got a seat appears in no mandate, and a constituency that only partly lies in the city has to be decided by hand.

`.context/` has no licence note yet for NINA, aponet.de, Overpass or TomTom. Berlin already uses them, so a new city adds no new terms. If you look a licence up, record it in the source's `.context` file.

## Licence check for city-specific sources

Check every source that only this city has before you wire it: news RSS (`feeds`), police press releases (`dataSources.police`, such as presseportal.de), transit (`transit`), events (`events`), council meetings (`councilMeetings`, OParl), roadworks (`roadworks`), district GeoJSON, a noise WMS, bathing water, a state's own wastewater data, Bürgeramt appointments, budget, population and social-atlas data.

1. Read the terms: the site's terms of use or the open-data portal's licence, `robots.txt`, and any licence file it links (an RSL file such as `/rsl.xml`).
2. **Feeds and police press releases are AI input.** Every item goes through the LLM classifier, and police reports through place extraction (`.context/ai-transparency.md`, features 2 to 4). A source whose terms forbid AI input is out, however good the feed: BZ Berlin was removed for this (`.context/news.md`, "Feed status"). Items are also stored, so note non-commercial and no-archiving clauses (the rbb24 note there).
3. **Everything else:** check redistribution, archiving and attribution. WAQI is the model: shown live, never archived, its agencies credited (`.context/weather.md`).
4. Record the licence in the source's `.context` file and credit the source in the city's `CITY_SOURCES` entry.
5. Probe a feed with Node's `fetch`, not curl: some CDNs answer curl with 403 (`.context/news.md`).

Then wire it:

- Many jobs parse one provider's format (`roadworks` has a parser per `provider`: `viz-berlin`, `hamburg-ogc`, `koeln-wfs`, `muenchen-wfs`, see `.context/roadworks.md`; `budget` is `berlin-doppelhaushalt`, `appointments` is `service-berlin`, `socialAtlas` is `mss-wfs`, `hh-sozialmonitoring` or `koeln-datenkatalog`, `population` is `afstat-ewr-xlsx`, `hh-stadtteile` or `koeln-datenkatalog`, see `.context/social-atlas.md` and `.context/population.md`; a source without polygons names an outline file in `packages/server/data/`). Read the job before you point it at another city's URL. A new format is a new data source: follow `.context/new-data-sources.md`.
- A feed needs its favicon (`FAVICON_SLUGS`, `FAVICON_SOURCES`; `.context/news.md`, "Favicons").
- A host the browser loads from needs the CSP in `render.yaml` and `SERVICES` in `PrivacyPage.tsx`.
- Feeds or police reports for a new city mean AI text served for it: check `.context/ai-transparency.md` still describes what is served, in the same change.
