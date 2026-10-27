---
name: add-city
description: Add a new city to City Monitor, or activate one that is configured but switched off (Hamburg, Köln). Use when asked to add, configure, wire up, enable or activate a city, or to wire an existing source (news feed, gauge, pollen region, NINA key) to a city. Covers both packages' city configs, the code keyed by city ID outside them, the identifiers for the Germany-wide sources, licence checks, tests, verification and activation.
---

# Add a city

The README's "Adding a City" is the overview for contributors. This is the working order, with the traps. Köln (`koeln`) is the template for a city with the Germany-wide sources only. Berlin is the only city with every source.

References beside this file:

- [city-keyed-code.md](city-keyed-code.md): every place outside the city configs that is keyed by city ID or hard-wires Berlin, and the tests that list cities by hand.
- [source-lookups.md](source-lookups.md): how to find and confirm the NINA key, DWD pollen region, DWD warn region, DWD UV entry and PEGELONLINE gauges, and the licence check for city-specific sources.

## Rules that fail silently when broken

- **ID.** Lowercase ASCII that matches `CITY_ID_PATTERN` in `packages/server/src/lib/validate-city.ts`; the API answers 400 to anything else. Transliterate (`koeln`, `muenchen`). The ID becomes the URL `/<id>`, the `[data-city='<id>']` selector, the `<id>:` cache prefix and the `city_id` of every stored row, so don't change it once the city is live. Name the config file `<id>.ts` in both packages and export only the config from it.
- **Name.** The German name with umlauts, as DWD and OpenStreetMap write it: `Köln`, never `Cologne` or `Koeln`. It has no translation key, so every language shows it as it is. The server matches on it: DWD warnings (the region name contains it), DWD UV (`uvi.json` city equals it), the AED Overpass area (OSM `name` equals it), Bundestag members (the constituency or list label contains it) and Ticketmaster events (`city=`). The news classifier and the briefing prompt name the city with it.
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
| `languages` | briefing languages, the news summary's `lang` | language switcher |
| `map.bounds`, `minZoom`, `maxZoom` | nothing | the map opens on `bounds` and cannot pan past them, so `bounds` is required |
| `map.center`, `map.zoom`, `theme.accent` | nothing (tests only) | nothing; the accent comes from `globals.css` |
| `feeds`, `dataSources` | every job | nothing; the web copy keeps `feeds: []` and `weather` because the type requires them |

## Order of work

1. **First slice.** Configure the city with the Germany-wide sources only, and leave it inactive: `/<id>` keeps redirecting to Berlin and no job fetches for it. That is a complete change on its own, as Köln was. Add each city-specific source later, in its own change, after its licence check.
2. **Server config.** Copy `packages/server/src/config/cities/koeln.ts` to `<id>.ts`. Set the identity fields, `coordinates` (the centre), `boundingBox` (the city limits), `map.center` as `[lon, lat]` of the centre, `map.bounds` around the box, and `dataSources.weather` at the centre (`config.test.ts` checks these agree). Find `nina`, `pollen` and `waterLevels` with [source-lookups.md](source-lookups.md). Add the city to `ALL_CITIES` in `packages/server/src/config/index.ts`.
3. **Web config.** Copy `packages/web/src/config/cities/koeln.ts`, with the same identity and `map`. Add it to `ALL_CITIES` in `packages/web/src/config/index.ts`, not to `ACTIVE_CITY_IDS`.
4. **Code keyed by city ID.** Add every entry [city-keyed-code.md](city-keyed-code.md) marks `every city` or `every DE city`: the pharmacy postcode, the `check:weather` list, the WAQI agencies, the Sources page and the accent colours.
5. **City-state assumptions.** Decide each one below; don't paper over it with a Berlin-style branch.
6. **City-specific sources.** Licence first, then wire ([source-lookups.md](source-lookups.md#licence-check-for-city-specific-sources)).
7. **Docs.** Add the city to the per-city lists of each source you wired: `.context/server.md` ("City Configuration"), `pollen.md` ("Region Mapping"), `water-levels.md` ("City Config"), `weather.md` (the `brightsky` cities and the WAQI agencies), `noise.md` for a noise map.
8. **Tests**, then **verify**, as below.
9. **Activate** only when the deployment's owner decides to, as below. It is a separate change.

## City-state assumptions

Berlin and Hamburg are city-states, and three lookups depend on it:

- **AEDs.** `ingest-aeds.ts` asks Overpass for a state-level area (`admin_level=4`) with the city's name, so any other city gets an empty AED layer and no error. Leave it empty, or make the admin level a config field in its own tested change (in German OpenStreetMap a kreisfreie Stadt is level 6).
- **State parliament.** `ingest-political.ts` counts every member of the state parliament in `PARLIAMENT_CONFIG` as the city's, so an entry for a city inside a state shows the whole Landtag. `ParliamentConfig` has no Bundestag-only form. Leave the city out, so it has no political data, until the state part can filter by constituency.
- **Labour market.** `ingest-labor-market.ts` fetches `Bundesland=Berlin`, for Berlin only. A state's figure is not a city's, so leave the tile Berlin-only (it already is). A city would need the Bundesagentur's district tables, licence-checked.

## What stays empty or Berlin-only

- **Berlin-only:** the Wastewater, Fire Department, Unemployment, Population, Crisis Services and Council Meetings tiles, and the social atlas, rent map, population, total-noise and live noise-sensor layers (README, "Adding a City", step 9).
- **Shown for every city, empty without a source:** Briefing and News (feeds and `OPENAI_API_KEY`), Transit, Events, Appointments, Budget, Bathing, Political and Water levels, and the political and noise toggles. The Sources page's shared groups credit Ticketmaster and abgeordnetenwatch.de for every city.
- Hiding a tile per city is a separate change. Say in the commit which tiles stay empty.

## Tests

- Extend the tests that list cities by hand ([city-keyed-code.md](city-keyed-code.md#tests-that-list-cities-by-hand)): nothing fails if you forget them.
- Pin the identifiers you looked up, as Köln's tests do: the "Köln config" block in `packages/server/src/config/config.test.ts`, the name match in `packages/server/src/cron/ingest-weather.test.ts` and the postcode in `packages/server/src/cron/ingest-pharmacies.test.ts`.
- `packages/web/src/config/add-city-skill.test.ts` keeps this skill honest: the files it names exist, the city-keyed table still matches the code, every configured city appears where `every city` says it must, and each ID passes the API's pattern and matches its file name.

## Verify

- From the repo root: `npm run typecheck`, `npm run lint` and `npm test`. CLAUDE.md, "Testing", shows how to run one file. From another folder, use `npm --prefix packages/web run test -- <file>`, not `npm --prefix packages/web exec -- vitest`, which runs in the current folder and collects the wrong test files.
- From `packages/server/`, on a machine with internet access: `npm run check:weather -- --city <id>` probes BrightSky, Open-Meteo air quality, DWD warnings and DWD UV for the city. It fails with `no entry for "<name>"` when DWD has no UV forecast under the name. It cannot confirm the warn-region name; the warn-cell list in [source-lookups.md](source-lookups.md) can.
- Confirm the NINA key, the pollen region and the gauges with the URLs in [source-lookups.md](source-lookups.md).
- No local browser can show the city yet. Synthetic mode serves Berlin alone (`packages/server/src/dev-synthetic.ts`, `packages/server/src/synthetic/generate.ts`), the guarded browser run (`harness/`) is built on it, and the web build routes only `ACTIVE_CITY_IDS`. Seeing the city takes the real API with the city in `ACTIVE_CITIES` and its ID in `ACTIVE_CITY_IDS` (uncommitted), on a machine with internet access. In a Claude Code session the dev servers are already running and must not be started again (CLAUDE.md), so there the tests are the check.

## Activate

Two switches. Turn on the server first, so the page never opens on an API that refuses the city.

1. **Server:** `ACTIVE_CITIES` on the API service, such as `berlin,<id>`. This is deploy configuration, set by whoever runs the deployment, not by a code change (Render: the API service's Environment; `render.yaml` holds the blueprint's default, `berlin`). See `.context/deploy-on-render.md`, "Adding a City". With feeds or a police feed, it also starts the city's LLM calls: new items every 10 minutes, a briefing every 6 hours.
2. **Web:** add the ID to `ACTIVE_CITY_IDS` in `packages/web/src/config/index.ts`, which ships with the next static-site build. Update the city's tests in `App.test.tsx` and `config/index.test.ts`, add `/<id>` and `/<id>/sources` to `vite.config.ts` and to `DASHBOARD_ROUTES` in `vite-plugin-seo.ts`, and add an OG image to `IMAGES` in `packages/web/scripts/generate-og-images.ts`. A skyline is optional (README step 10).

After the switch, a job skips its startup run while its newest stored row, from any city, is still fresh. The new city then fills at each job's next scheduled run: political data weekly, AEDs daily. If `app.ts` decides startup runs per city (each job carries a `serves` predicate), the city fills at startup instead.

## Done when

- The checks are green and the hand-listed tests name the city.
- Every `every city` row in [city-keyed-code.md](city-keyed-code.md) has its entry, and each identifier has been confirmed against its source.
- Every city-specific source has a recorded licence that allows its use, AI input included for feeds and police reports.
- The commit says which tiles stay empty, and whether the city is active.
