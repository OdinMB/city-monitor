# Electricity (SMARD, Energy-Charts)

A dashboard tile for all four cities: the renewable share and generation mix of the grid control area that serves the city, and Germany's CO₂ intensity and grid traffic light with the next green window ("a good time to use power").

## Sources

**SMARD** (Bundesnetzagentur), CC BY 4.0, credit "Bundesnetzagentur | SMARD.de" (smard.de/home/datennutzung). No key, CORS open, no stated rate limit.

- `https://www.smard.de/app/chart_data/<filter>/<region>/index_quarterhour.json` lists the week files (epoch ms of Monday 00:00 German time); `…/<filter>/<region>/<filter>_<region>_quarterhour_<week>.json` gives `{ meta_data, series: [[ms, MWh in the quarter-hour | null], …] }`, 672 quarter-hours a week, null until published (about 45 min behind).
- Regions: the control areas `50Hertz`, `Amprion`, `TenneT`, `TransnetBW` (and `DE`). The city's is `dataSources.electricity.controlArea`: Berlin and Hamburg **50Hertz** (its grid area covers Berlin, Brandenburg, Hamburg, Mecklenburg-Vorpommern, Sachsen, Sachsen-Anhalt, Thüringen; 50hertz.com, checked 2026-11-03), Köln **Amprion**, München **TenneT**. TenneT's area also holds the North Sea offshore wind, so München's share runs high.
- Filters used (`SMARD_FILTERS`): 1225 wind offshore, 4067 wind onshore, 4068 solar, 4066 biomass, 1226 hydro, 1228 other renewables, 1223 lignite, 4069 hard coal, 4071 gas, 4070 pumped storage, 1227 other conventional. Nuclear (1224) is left out: none since April 2023, and SMARD answers 404 for it in the control areas. Amprion has no offshore series (404).
- **Day-ahead prices are not used.** SMARD's licence page (checked 2026-11-03): "Wir überprüfen rechtliche Fragen zur Lizenzierung der Großhandelspreise derzeit umfassend im Rahmen des aktuellen Festlegungsverfahrens HEDWIG. Diese sollten daher bis auf weiteres nicht weiterverwendet werden." Energy-Charts' `/price` carries the same data ("from Bundesnetzagentur | SMARD.de"). Adding a price is the owner's call once SMARD lifts the hold.

**Energy-Charts API** (Fraunhofer ISE), CC BY 4.0, "Proper attribution to Energy-Charts.info as the source is required" (OpenAPI description). No key. Rate limit per IP and endpoint: about 2 requests a minute (burst 4), `/signal` 20 a minute; 429 with `Retry-After` beyond. Never call it from the browser.

- `https://api.energy-charts.info/signal?country=de`: `unix_seconds`, `share` (renewable share of **load**, %), `signal` (2 green, 1 yellow, 0 red for a low share, -1 red for grid congestion), `substitute`. Today in German time, 96 quarter-hours, measured and forecast; `postal_code` changes nothing yet.
- `https://api.energy-charts.info/co2eq?country=de`: `unix_seconds`, `co2eq` (g/kWh, measured, null until published; at 01:10 UTC only the first three of the new day were out) and `co2eq_forecast`. Not listed in the OpenAPI paths (checked 2026-11-03) but answering with `deprecated: false`; if it goes, the tile loses only its CO₂ figure.
- Neither has control areas (the `country` enum is countries only), so CO₂, signal and Germany's share are labelled "Germany" in the tile.

## Server

- `cron/ingest-electricity.ts`, job `ingest-electricity` at minutes 2, 17, 32 and 47 (`2,17,32,47 * * * *`), for every active city with `dataSources.electricity`.
- Each run: Energy-Charts `/signal` and `/co2eq` once for all cities; per distinct control area one SMARD index and 11 series (Berlin and Hamburg share 50Hertz's). While the current SMARD week holds less than a day (Monday morning), the previous week's 11 series too, for the 24-hour course. That is 2 + 12 × 3 requests a run with all four cities.
- `buildMix`: the newest quarter-hour every series of the area has reached (a 404 series counts as absent); MWh × 4 = average MW; renewable share = wind, solar, biomass, hydro and other renewables over all generation (pumped storage counts as conventional, as SMARD does). `renewableHistory`: the hourly share for the hour of that quarter-hour and the 23 before it.
- A series that fails with anything but 404 fails the whole area (a missing coal series would inflate the share); that area's mix then stays at the last run's, as does the grid when Energy-Charts fails. Each part carries its own time. Nothing is stored when both are missing.
- Output `ElectricityData { controlArea, mix, renewableHistory, grid }` (`shared/types.ts`, `ElectricityDataSchema`), about 10 KB a city.
- Cache `{city}:electricity`, TTL 1800 s; DB snapshot type `smard-electricity` (2-day retention plus the row cap); `loadElectricity` max age 3 h; in bootstrap as `electricity`.
- Route `GET /api/:city/electricity`, cache → DB → `{ data: null, fetchedAt: null }`, `Cache-Control: max-age=300`.

## Frontend

- Feature `electricity` (all four web configs), hook `useElectricity` (5-min refetch, seeded by bootstrap), freshness `electricity` in `lib/freshness.ts`.
- `lib/electricity.ts` reads the data at the viewer's now: `gridPointAt`, `co2Now` (the newest measured value unless over 2 h old, then the forecast for now, marked "forecast"), `nextGreenWindow` (first run of signal 2 from the current quarter-hour), `greenestHour` (four consecutive quarter-hours with the highest share ahead), `groupMix` (wind, solar, biomass, hydro incl. other renewables, gas, coal, other incl. pumped storage).
- `ElectricityStrip`, expandable, after the wastewater tile: the area's renewable share and its time, a stacked mix bar with legend; Germany's CO₂ and traffic light with "Green until …" / "Green …–…" / "No green period forecast". Expanded: 24-hour sparkline of the area's share, today's signal as a 96-cell timeline (past cells faded), the greenest hour ahead, Germany's share of load now, GW per group.
- Footer: links "Bundesnetzagentur | SMARD.de · Energy-Charts.info · CC BY 4.0" in every language, plus the update time and the stale note. Sources page: "SMARD (Bundesnetzagentur)" and "Energy-Charts (Fraunhofer ISE)" under Energy, `requires: 'electricity'`.
- i18n: `panel.electricity.*` in all four bundles. Times go into the sentences as isolated runs for Arabic.

## Tests

- `cron/ingest-electricity.test.ts`: SMARD parsing, `buildMix` (newest common quarter-hour, absent series, 24 hours, nothing complete), `buildGrid`, one request per area and Energy-Charts once, the previous week on a young week, a failed series keeping the last run's parts, both failing, no city with the source.
- `routes/electricity.test.ts`: empty, cached (also in bootstrap), unknown city.
- `lib/electricity.test.ts`, `components/strips/ElectricityStrip.test.tsx`.
- Synthetic: `generateElectricity` in `synthetic/generate.ts` (a solar bump around noon), seeded for all four cities.
