---
name: add-city
description: Add a new city to City Monitor, or activate one that is configured but switched off (Köln, München). Use when asked to add, configure, wire up, enable or activate a city, or to wire an existing source (news feed, gauge, pollen region, NINA key) to a city. Covers both packages' city configs, the code keyed by city ID outside them, the identifiers for the Germany-wide sources, licence checks, tests, verification and activation.
---

# Add a city

The README's "Adding a City" is the overview for contributors. This is the working order, with the traps. Köln (`koeln`) is the template for a city inside a state with the Germany-wide sources, München (`muenchen`) for one that also has no federal river gauge. Both are cities inside a state ("City-state assumptions"), and since 2026-11-01 both have political data by constituency. Since 2026-11-01 both also have news feeds, and Köln a police feed: when you copy them for the first slice, empty `feeds` and drop `police`, whose sources are theirs alone. Berlin is the only city with every source.

References beside this file:

- [city-keyed-code.md](city-keyed-code.md): every place outside the city configs that is keyed by city ID or hard-wires Berlin, and the tests that list cities by hand.
- [source-lookups.md](source-lookups.md): how to find and confirm the NINA key, DWD pollen region, DWD warn region, DWD UV entry and PEGELONLINE gauges, and the licence check for city-specific sources.

## Rules that fail silently when broken

- **ID.** Lowercase ASCII that matches `CITY_ID_PATTERN` in `packages/server/src/lib/validate-city.ts`; the API answers 400 to anything else. Transliterate (`koeln`, `muenchen`). The ID becomes the URL `/<id>`, the `[data-city='<id>']` selector, the `<id>:` cache prefix and the `city_id` of every stored row, so don't change it once the city is live. Name the config file `<id>.ts` in both packages and export only the config from it.
- **Name.** The German name with umlauts, as DWD and OpenStreetMap write it: `Köln`, never `Cologne` or `Koeln`. It has no translation key, so every language shows it as it is. The server matches on it: DWD warnings (the region name contains it, unless `dataSources.weather.dwdWarnRegion` names the region exactly, as a city inside a state must: [source-lookups.md](source-lookups.md)), DWD UV (`uvi.json` city equals it), the AED Overpass area (OSM `name` equals it), a city-state's Bundestag members (the constituency or list label contains it) and Ticketmaster events (`city=`). The news classifier and the briefing prompt name the city with it.
- **One identity in both packages.** `id`, `name`, `country`, `coordinates`, `boundingBox`, `timezone` and `languages` must be equal in the web and server configs (`packages/web/src/config/index.test.ts` checks).
- **Germany only, so far.** `country: 'DE'` switches on DWD warnings and UV, NINA, pharmacies, AEDs and political data. A city elsewhere needs a weather adapter first (`.context/weather.md`, "Adding a non-German city").

## Which side reads which field

| Field | Server | Web |
|---|---|---|
| `id` | routes, cache keys, stored rows | routes, `data-city`, every data hook |
| `name` | the matches above, LLM prompts | page title, top bar, Sources page |
| `country` | the `'DE'` switches above | NINA banner |
| `coordinates` | nothing; weather reads `dataSources.weather`, which tests require to match | the map (`CityMap.tsx`) |
| `boundingBox` | TomTom traffic, WAQI stations | which news items go on the map |
| `timezone` | weather days, briefing | the UV value for today |
| `languages` | briefing languages, the news summary's `lang` | the language the briefing is asked for; the switcher offers all four interface languages in every city, and a briefing in another language than the page's says so |
| `map.bounds`, `minZoom`, `maxZoom` | nothing | the map opens on `bounds` and cannot pan past them, so `bounds` is required |
| `map.center`, `map.zoom`, `theme.accent` | nothing (tests only) | nothing; the accent comes from `globals.css` |
| `feeds`, `dataSources` | every job | not in the web config (`WebCityConfig`) |
| `features` (web only) | nothing; `cityFeatures` in `packages/server/src/lib/city-features.ts` derives the same list from the server config | which tiles, map layers, sub-layers, political views and Sources-page credits the city shows: nothing else, so nothing shows empty |

## Order of work

1. **First slice.** Configure the city with the Germany-wide sources only, and leave it inactive: `/<id>` keeps going to the city picker and no job fetches for it. That is a complete change on its own, as Köln was. Add each city-specific source later, in its own change, after its licence check.
2. **Server config.** Copy `packages/server/src/config/cities/koeln.ts` to `<id>.ts`. Set the identity fields, `coordinates` (the centre), `boundingBox` (the city limits), `map.center` as `[lon, lat]` of the centre, `map.bounds` around the box, and `dataSources.weather` at the centre (`config.test.ts` checks these agree). Find `nina`, `pollen`, `waterLevels`, `weather.dwdWarnRegion` and `aeds` with [source-lookups.md](source-lookups.md); a city inside a state needs the last two (below). Add the city to `ALL_CITIES` in `packages/server/src/config/index.ts`.
3. **Web config.** Copy `packages/web/src/config/cities/koeln.ts`, with the same identity and `map`. List in `features` what the server ingests for the city (`cityFeatures`; `config/index.test.ts` fails until the two agree) and the web app's own: `noiseMap`/`noiseTotal` with a noise map, `crisis` with a directory in `packages/web/src/components/strips/crisis-services.ts` (verified numbers with source URL and `checkedOn`), `rentMap` for Berlin alone. Add it to `ALL_CITIES` in `packages/web/src/config/index.ts`, not to `ACTIVE_CITY_IDS`. Wiring a source later (step 6) adds its feature here in the same change.
4. **Code keyed by city ID.** Add every entry [city-keyed-code.md](city-keyed-code.md) marks `every city` or `every DE city`: the pharmacy postcode, the `check:weather` list, the WAQI agencies, the Sources page and the accent colours.
5. **City-state assumptions.** Decide each one below; don't paper over it with a Berlin-style branch.
6. **City-specific sources.** Licence first, then wire ([source-lookups.md](source-lookups.md#licence-check-for-city-specific-sources)).
7. **Docs.** Add the city to the per-city lists of each source you wired: `.context/server.md` ("City Configuration"), `pollen.md` ("Region Mapping"), `water-levels.md` ("City Config"), `weather.md` (the `brightsky` cities and the WAQI agencies), `noise.md` for a noise map.
8. **Tests**, then **verify**, as below.
9. **Activate** only when the deployment's owner decides to, as below. It is a separate change.

## City-state assumptions

Berlin and Hamburg are city-states. Köln and München are not, and four lookups depend on it (and the political map layer, below):

- **AEDs.** `ingest-aeds.ts` asks Overpass for the area with the city's name at `dataSources.aeds.adminLevel`, or at the state level (4) without it, which an empty AED layer and no error would show for a city inside a state. Set `aeds: { adminLevel: 6 }` for a kreisfreie Stadt, as Köln and München do, and confirm it (source-lookups.md).
- **DWD warnings.** A name match also takes in the Landkreis named after the city; set `dataSources.weather.dwdWarnRegion` (source-lookups.md).
- **Parliaments.** A `PARLIAMENT_CONFIG` entry in `ingest-political.ts` without `constituencies` counts every member of the state parliament as the city's, and the Bundestag members whose constituency or Landesliste label contains `name`: right for a city-state, the whole Landtag and half the state's Bundestag list for anyone else. A city inside a state names its constituencies instead, `constituencies: { bundestag, state }`, as abgeordnetenwatch labels them without number and period (`92 - Köln I (Bundestag 2025 - 2029)` is `Köln I`); then only members whose candidacy was in one of them count, list members included, and nobody from the state list who stood elsewhere. Find them in the period's mandates (source-lookups.md), leave out a Landkreis named after the city (`München-Land`), keep a Wahlkreis the city shares (`Leverkusen – Köln IV`), and pin them in `ingest-political.test.ts`. They change with each redistricting: a name no mandate stood in is logged, and a level where none matches keeps its previous data. In Bavaria the CDU/CSU Bundestag group is the CSU (`unionParty: 'CSU'`). Hand-kept office holders are optional: `OBERBUERGERMEISTER` (the `mayor` feature, the political tile's City Hall view) and `BEZIRKSBUERGERMEISTER` (`districtMayors`), each with its source page and verification date. Group state members by Bezirk (`STATE_CONSTITUENCY_BEZIRKE`) only where the constituencies are named after Bezirke (Berlin).
- **Labour market.** `ingest-labor-market.ts` fetches `Bundesland=Berlin`, for Berlin only. A state's figure is not a city's, so leave the tile Berlin-only (it already is). A city would need the Bundesagentur's district tables, licence-checked.
- **Political map layer.** It colours the Bezirk outlines in `DISTRICT_URLS`, one view per level whose members map onto Bezirke: district mayors (`districtMayors`), Bundestag constituencies named after Bezirke (web-only `bundestagByDistrict`, city-states only) and state members grouped by Bezirk (`stateByDistrict`). A city inside a state has Stadtbezirke that are not its constituencies, so it gets no `bundestagByDistrict`; with district mayors it still gets `politicalMap` (web-only) and the mayors' view (Köln), without them no political layer, outlines or not (München). `config/index.test.ts` checks `politicalMap` against the outlines and those views.

## What a city without a source shows

Nothing for it. Each tile, map layer, sub-layer, political view and feature-bound Sources-page credit needs a feature in the web config's `features` (`CityFeature` in `shared/types.ts`), so a city shows exactly what it has data for: no empty tile, no "all clear" without data, no Berlin-only copy. A sub-layer list with one entry left is not shown; a number key whose layer the city lacks does nothing. The dashboard grid fills the holes missing tiles leave (`grid-flow-row-dense` in `DashboardGrid`).

- **Berlin-only features:** wastewater, fire brigade, labour market, population, bathing (their jobs fetch for Berlin alone), the rent map (Berlin's own WMS), the crisis tile's regional Local tab (Berliner Krisendienst), state members by Bezirk (`STATE_CONSTITUENCY_BEZIRKE`). District mayors are Berlin's and Köln's, the Oberbürgermeister Köln's and München's (hand-kept tables in `ingest-political.ts`); the political map layer Berlin's, Hamburg's (Bundestag view only) and Köln's (district mayors' view only) (`politicalMap`). All four cities ship district outlines.
- **Every city, no feature:** weather, air quality, rain radar and traffic incidents.
- **Every German city, as features:** `aeds` (defibrillators) and `pharmacies` (with a postcode in `CITY_PLZ`). The Emergencies layer shows with either, and its sub-layer buttons with both.
- The Briefing needs `OPENAI_API_KEY` besides feeds; without it the tile says there are no articles.
- Say in the commit which features the city has.

## Tests

- Extend the tests that list cities by hand ([city-keyed-code.md](city-keyed-code.md#tests-that-list-cities-by-hand)): nothing fails if you forget them.
- Pin the identifiers you looked up, as Köln's tests do: the "Köln config" block in `packages/server/src/config/config.test.ts`, the name match in `packages/server/src/cron/ingest-weather.test.ts`, the postcode in `packages/server/src/cron/ingest-pharmacies.test.ts` and the constituencies in `packages/server/src/cron/ingest-political.test.ts` ("PARLIAMENT_CONFIG for cities inside a state").
- `packages/web/src/config/add-city-skill.test.ts` keeps this skill honest: the files it names exist, the city-keyed table still matches the code, every configured city appears where `every city` says it must, and each ID passes the API's pattern and matches its file name.

## Verify

- From the repo root: `npm run typecheck`, `npm run lint` and `npm test`. CLAUDE.md, "Testing", shows how to run one file. From another folder, use `npm --prefix packages/web run test -- <file>`, not `npm --prefix packages/web exec -- vitest`, which runs in the current folder and collects the wrong test files.
- From `packages/server/`, on a machine with internet access: `npm run check:weather -- --city <id>` probes BrightSky, Open-Meteo air quality, DWD warnings and DWD UV for the city. It fails with `no entry for "<name>"` when DWD has no UV forecast under the name. It cannot confirm the warn-region name; the warn-cell list in [source-lookups.md](source-lookups.md) can.
- Confirm the NINA key, the pollen region and the gauges with the URLs in [source-lookups.md](source-lookups.md).
- Synthetic mode serves one configured city per run (`--city <id>`; `packages/server/src/dev-synthetic.ts`, `packages/server/src/synthetic/generate.ts`), and the guarded browser run built on it makes that city the one active city of its own build (`harness/README.md`, "Cities"), so it can show the city on synthetic data before activation; any other web build routes only `ACTIVE_CITY_IDS`. Seeing the city's real data takes the real API with the city in `ACTIVE_CITIES` and its ID in `ACTIVE_CITY_IDS` (uncommitted), on a machine with internet access. In a Claude Code session the dev servers are already running and must not be started again (CLAUDE.md), so there the tests are the check.

## Activate

Two switches. Turn on the server first, so the page never opens on an API that refuses the city.

1. **Server:** `ACTIVE_CITIES` on the API service, such as `berlin,<id>`. This is deploy configuration, set by whoever runs the deployment, not by a code change (Render: the API service's Environment; `render.yaml` holds the blueprint's default, `berlin,hamburg,koeln,muenchen`). See `.context/deploy-on-render.md`, "Adding a City". With feeds or a police feed, it also starts the city's LLM calls: new items every 10 minutes, a briefing every 6 hours.
2. **Web:** add the ID to `ACTIVE_CITY_IDS` in `packages/web/src/config/index.ts`, which ships with the next static-site build. Update the city's tests in `App.test.tsx` and `config/index.test.ts`. The build then pre-renders `/<id>` and `/<id>/sources` and lists them in the sitemap from the city's `CITY_META` entry in `packages/web/src/lib/seo-pages.ts`, and fails while the entry or its share image is missing: add both before or with the switch (the image is an `IMAGES` entry in `packages/web/scripts/generate-og-images.ts`, made by `npm run generate:og` in `packages/web`, which needs the network). Köln and München have their entries and not yet their images. A skyline is optional (README step 10).

When the API starts with the city active, the startup check looks at each active city a job serves (its `serves` predicate in `FRESHNESS_SPECS`, `packages/server/src/app.ts`) and runs the job when any of them has no fresh data, so the new city fills at startup rather than at each job's next scheduled run. `ingest-appointments` alone keeps the table-wide check (`.context/server.md`, "Which cities a job serves").

## Done when

- The checks are green and the hand-listed tests name the city.
- Every `every city` row in [city-keyed-code.md](city-keyed-code.md) has its entry, and each identifier has been confirmed against its source.
- Every city-specific source has a recorded licence that allows its use, AI input included for feeds and police reports.
- The commit says which tiles stay empty, and whether the city is active.
