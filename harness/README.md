# harness/: guarded local browser run

Development tooling. One foreground command builds and serves the web app on synthetic data, opens it in headless Chromium and writes screenshots and a JSON report. Nothing it starts can reach another machine, and it writes only under the folder you give it.

```bash
node harness/see.mjs --out /tmp/see-out
node harness/see.mjs --out /tmp/see-out --viewport 390x844,1440x900 --lang de,en --theme light,dark --scroll
node harness/see.mjs --out /tmp/see-out --path /berlin --steps steps.json --full-page
node harness/see.mjs --out /tmp/see-out --scenario storm --viewport 390x844 --scroll
node harness/see.mjs --out /tmp/see-out --city hamburg --scenario quiet --scroll
```

It needs Node, the repo's installed dependencies (`npm ci`), Postgres server binaries (`initdb`, `postgres`, `createdb`) and Playwright with its Chromium. Playwright is not a dependency of this repository; the harness loads an installed copy. Nothing is added to any `package.json` or the lockfile.

## What one run does

1. Checks the parameters, then builds the environment of every process it will start from nothing (see "Guard") and checks it. A failure exits before anything starts.
2. Picks free ports on 127.0.0.1 (binding port 0 and releasing it) for Postgres, the API and a closed proxy port.
3. Creates `<out>/<run id>/`, with a temporary `HOME`, `XDG_*` folders and `TMPDIR` inside it.
4. Builds the web app with Vite into the run folder while the next steps run. The config is inline: it reads no `.env` file (`envDir: false`), keeps Vite's cache in the run folder, leaves `VITE_API_BASE` unset, so the app calls `/api` on its own origin, and makes `--city` the app's one active city (see "Cities").
5. Runs `initdb` into `<run>/pg/data` and starts `postgres` on 127.0.0.1 only, on its port, with no Unix socket and password login for one role (`harness`, random password per run). It checks `postmaster.pid` names the process and port it started, then creates `city_monitor_dev`.
6. Seeds it for `--city` with `packages/server/src/scripts/seed-synthetic.ts` (the code behind `npm run db:seed`), `--seed` as given, and then, in the same process, applies `--scenario` to that city's rows (see "Scenarios").
7. Starts the API for `--city` with `packages/server/src/dev-synthetic.ts` (the code behind `npm run dev:synthetic`, without `tsx watch`), `PORT` set to its port, bound to 127.0.0.1.
8. Serves the built app on 127.0.0.1 on a port the server picks itself, passing `/api/*` to the API, and prints `hermetic-guard: ok port <web port>`.
9. Opens every combination of `--path`, `--viewport`, `--lang` and `--theme` in its own browser context, screenshots it, runs the steps, and writes `report.json`.
10. Stops the browser, the web server, the API and Postgres, and checks their ports are free again. The same happens on an error, on `--timeout`, and on SIGINT or SIGTERM.

The server processes load the product's TypeScript through `tsx` and `shared/*.ts` through a resolve hook (`lib/shared-source-hook.mjs`), so a run never builds `shared/dist` or anything else in the checkout. They are started with `node` directly, never through the package scripts that pass `--env-file-if-exists=.env`.

## Parameters

| Parameter | Default | What it varies |
|---|---|---|
| `--out <folder>` | required | Where the run writes. Each run makes `<folder>/<run id>/`, so one folder can hold several runs. Refused when it is inside the checkout or holds it, and, from a linked worktree (such as one under `.claude/worktrees/`), when it is inside the main checkout (the folder with the common `.git`) or holds it. |
| `--city <id>` | `berlin` | The city the run seeds, serves and shows: one that both `packages/server` and `packages/web` register, today `berlin` or `hamburg` (see "Cities"). Any other id exits 1 with the list. |
| `--path <path>` | `/<city>` | A page on the run's own web server. Repeatable. Must start with one `/`. |
| `--viewport <WxH>` | `1440x900` | Browser viewport. Repeatable or comma-separated, e.g. `390x844,1440x900`. Widths under 768 get touch and mobile emulation. |
| `--lang <de\|en\|tr\|ar>` | `de` | The app's language (set in `localStorage` before load) and the browser locale. Repeatable or comma-separated. |
| `--theme <light\|dark>` | `light` | The app's theme (set in `localStorage` before load) and the browser's color scheme. Repeatable or comma-separated. |
| `--seed <n>` | `1` | The synthetic data set. The same seed gives the same data, dated relative to the run. |
| `--scenario <name>` | `default` | The state of the data: `default` (the seed as generated), `quiet`, `outage`, `storm` or `no-data` (see "Scenarios"). Any other name exits 1 with the list. |
| `--scroll` | off | Scroll each page to the bottom and back before the first screenshot, so lazily loaded tiles load. |
| `--full-page` | off | Screenshot the whole page instead of the viewport. |
| `--steps <file.json>` | none | Steps run on every page after its first screenshot (below). |
| `--settle <ms>` | `1500` | Wait after the page loads and after each step. |
| `--timezone <name>` | `Europe/Berlin` | The browser's time zone. |
| `--timeout <seconds>` | `480` | Stops everything and exits 1 after this long. |
| `--pg-bin <dir>` | search | Folder with `initdb`, `postgres` and `createdb`. Without it: the first `PATH` entry with all three, then the newest `/usr/lib/postgresql/<n>/bin`. |
| `--pg-user <name>` | `postgres` | When running as root only: the system user Postgres appears as (below). |
| `--playwright <dir>` | search | The Playwright package folder. Without it: the checkout's `node_modules`, each `NODE_PATH` entry, then the global `node_modules` of the running Node. |
| `--guard-test=<case>` | none | Negative test (see "Guard"): `env`, `target`, `target-loopback` or `network`. |
| `--help` | | Prints the usage. |

### Steps file

A JSON array; each step has an `action` and the fields it needs. Elements are found by CSS `selector` or by visible `text` (substring; `"exact": true` for whole text), the first match unless `nth` (0-based) says otherwise. `timeout` (ms) overrides the default 15 s for one step.

| Action | Fields | Does |
|---|---|---|
| `click` | `selector` or `text` | Clicks the element. |
| `tap` | `selector` or `text` | Taps it; needs a touch viewport (width under 768). |
| `hover` | `selector` or `text` | Moves the mouse over it. |
| `wait` | `ms`, or `selector` or `text` | Waits that long, or until the element is visible. |
| `scroll-to` | `selector` or `text`, or `position`: `top` / `bottom` | Scrolls the element into view, or the page to its top or bottom. |
| `press` | `key` | Presses a key, e.g. `Escape`. |
| `goto` | `path` | Opens another path on the run's server. |
| `screenshot` | `name`, optional `selector` or `text` | Screenshots the page (or only that element) as `...__<NN>-<name>.png`. |

```json
[
  { "action": "scroll-to", "text": "Pollen" },
  { "action": "click", "text": "Pollen" },
  { "action": "wait", "ms": 500 },
  { "action": "screenshot", "name": "pollen-open" },
  { "action": "press", "key": "Escape" }
]
```

A failing step is recorded in the report with a screenshot named `...__<NN>-error.png`; the remaining steps of that page are skipped and the next page runs.

## Cities

`--city <id>` names the city a run seeds, serves and shows. It has to be registered in `ALL_CITIES` in both `packages/server/src/config/index.ts` and `packages/web/src/config/index.ts`; the parent reads both files before anything starts ([`lib/cities.mjs`](lib/cities.mjs)). Today that is `berlin`, the default, and `hamburg`.

The run's city is the only active one. The seed script and the API get `--city` and serve that city alone (`ACTIVE_CITIES`). The web build makes it the one entry of the web config's `ACTIVE_CITY_IDS`: a Vite plugin rewrites that one line in the build, the file in the checkout is not changed, and the build fails if it never saw the file. So `/` leads to the run's city, another city's path redirects there, and `--path` defaults to `/<city>`.

The seed (`generateSyntheticCityData` in `packages/server/src/synthetic/generate.ts`) holds the data sets the real app ingests for that city, as `syntheticCoverage` there lists them, and no others:

| City | Seeded | Not seeded, as the real app has no source for them there |
|---|---|---|
| `berlin` | every data set the generator makes, exactly as before `--city` existed | none |
| `hamburg` | news and the briefing, police reports, weather with DWD warnings and UV, air quality and its grid, civil-protection warnings, water levels (three Elbe gauges), traffic, pharmacies, defibrillators, pollen, members of the Bundestag and the Bürgerschaft | events, transit, citizen-office appointments, budget, construction, social atlas, population, wastewater, bathing water, labour market, fire brigade, noise sensors, council meetings, district politics |

Every coordinate lies inside the city's bounding box. Where the web app has district outlines for the city (`packages/web/src/data/districts/<city>-bezirke.geojson`), the data names those districts, each at a point inside its outline: Hamburg's seven Bezirke. A city without them gets nine places spread around its centre, named after the city, and no district fields. The Berlin-only tiles (wastewater, fire brigade, labour market, population, crisis support, council meetings) stay absent for other cities, as in the real app. Apart from the names of districts and river gauges, which match the city's config, every name, number and text is invented, and nothing is fetched. The seed works out local dates and hours in Europe/Berlin, the zone of both configured cities.

## Scenarios

The seed holds one ordinary day: six transit disruptions (in a city with transit data), one moderate weather warning and one minor civil-protection warning, all just fetched. `--scenario <name>` changes that in the run's own database after the seed and before the API starts, so the API and the app read the result like any other data. Each scenario is a fixed change to the seed's snapshot rows ([`lib/scenarios.mjs`](lib/scenarios.mjs)), with times counted from when it is applied, a few seconds after the seed: the same seed and the same moment give the same data, and nothing in it is random. It touches only the run city's rows of the snapshot types it names; every other tile shows the seed.

A scenario works on any city, for the snapshot types that city's seed holds. A change to a type the city has no data for at all is left out, so that tile stays as the real app shows it for the city: Hamburg has no transit source, so `quiet`, `outage` and `no-data` leave transit out there, and `storm` and `default` apply in full. The transit tile is still on Hamburg's dashboard in every scenario, as in the real app: `/api/hamburg/transit` answers `{ "data": [], "fetchedAt": null }`, and the tile shows its empty text, "Alles in Ordnung — keine Störungen" (`panel.transit.empty`), with no update time. The run says so on standard output and in the report (`scenarioLeftOut`). In Berlin nothing is left out.

The API serves the newest snapshot row of a type, with its `fetched_at` as `fetchedAt`, and the app marks a tile outdated once that is older than the tile's limit in `packages/web/src/lib/freshness.ts` (transit about 37 minutes, weather about 110). Where an ingestion run finds nothing, it keeps the empty list in the cache and writes no row; synthetic mode has no ingestion and warms its cache from the database, so a scenario writes a row holding the empty list, and the API answers `{ "data": [], "fetchedAt": "<when the scenario ran>" }` as it would after such a run.

| Scenario | Data | What it lets you see |
|---|---|---|
| `default` | The seed as generated. | Every tile with data in it. |
| `quiet` | Transit: an empty list, fetched now. Weather: the seeded forecast without warnings. Civil-protection warnings: an empty list, fetched now. | The transit tile with no disruptions on fresh data, no weather warnings, no warnings banner. |
| `outage` | Transit: the seeded disruptions, fetched 4 hours ago. Weather: the seeded forecast, fetched 6 hours ago, and no weather history from the last 6 hours. Water levels: no rows at all. | The transit and weather tiles on stale data (fetched 4 and 6 hours ago, past their limits), the water-level tile with no data and no river gauges on the map (bathing spots stay). |
| `storm` | Weather: the seeded forecast with the five warnings below. Civil-protection warnings: the one below, fetched now. Transit as seeded. | Weather warnings at each level, several at once and out of order, one with no end, one already over; a severe warning in the banner and its area on the map. |
| `no-data` | No transit, weather or civil-protection rows at all. | The transit tile with no update time and the same empty text as `quiet`, "Alles in Ordnung — keine Störungen" (`/api/<city>/transit` answers `{ "data": [], "fetchedAt": null }`, and the tile does not tell no data from no disruptions), no current weather anywhere (the header hides its weather chip, as it does whenever there is no current weather), no warnings banner. |

The storm's weather warnings, in the order the API serves them. Each headline starts with `[Synthetisch]`, and the shape is the one the DWD ingestion writes: `severity` `moderate`, `severe` or `extreme`, and an empty `validUntil` for a warning with no end.

| Headline | `severity` | `validUntil` |
|---|---|---|
| Amtliche UNWETTERWARNUNG vor ORKANBÖEN | `severe` | in 3 hours |
| Amtliche WARNUNG vor STURMBÖEN | `moderate` | in 6 hours |
| Amtliche WARNUNG vor EXTREMEM UNWETTER | `extreme` | in 2 hours |
| Amtliche WARNUNG vor DAUERREGEN | `moderate` | `""` (no end) |
| Amtliche UNWETTERWARNUNG vor SCHWEREM GEWITTER | `severe` | an hour ago |

The storm's civil-protection warning: `[Synthetisch] Probewarnung Sturm: Aufenthalt im Freien meiden`, `severity` `severe`, `source` `mowas`, issued 30 minutes before and expiring 12 hours after the scenario ran, over a rectangle about 10 by 9 km around the city's centre (the coordinates in its config): central Berlin for Berlin, the same rectangle as before `--city` existed. The storm changes no weather values: wind, temperature and the forecast stay as seeded.

How a tile presents each state is up to the app; a scenario only sets the data. The seed process prints how many rows the scenario deleted, changed and added to `logs/seed.log`, then `harness-scenario: left out <types>` when it left any out, then `harness-scenario: applied <name>`; without that last line the run stops with exit 1 before the API starts.

## Output

Under `<out>/<run id>/`:

- `screenshots/<path>__<WxH>__<lang>__<theme>.png`, plus `__<NN>-<name>.png` for each screenshot step. The path `/berlin/sources` becomes `berlin-sources`.
- `report.json`: the city, the seed and the scenario with the types it left out (`scenarioLeftOut`), ports, parameters, every blocked host with its count, every request answered locally (`servedLocally`, see "The map") with its count, and per page its screenshots, console errors (flagged when they come from a blocked request), page errors, failed or 4xx/5xx requests to the run's own server, blocked hosts, requests answered locally and step errors. `portsFreeAfterStop` says whether each port was free once everything stopped.
- `logs/`: output of Postgres, the seed, the API and the web build.
- `pg/`, `home/`, `tmp/`, `web/`, `vite-cache/`, `guard/`: the database, the temporary home and temp folder (the browser profile included), the built app, Vite's cache and the guard files the server processes check themselves against. Delete the run folder when done.

Standard output prints `run folder: ...`, `city: <id>`, `scenario: <name> (<what it holds>)` (followed by `; left out, as <city> has no such data: <types>` when the scenario left a type out), then `hermetic-guard: ok port <web port>`, one summary line per page, the blocked hosts, the requests served locally, whether the ports were free after stopping and `report: ...`.

Exit codes: `0` done, `1` error or timeout, `2` the guard refused, `3` a step failed (screenshots and report are still written), `130`/`143` stopped by SIGINT/SIGTERM.

### The map

The app creates its map only once its base-map style has loaded from `basemaps.cartocdn.com`. The browser's routes answer that one request (`https://basemaps.cartocdn.com/gl/<style>/style.json`, the light and the dark style) from memory with a stand-in built in [`lib/map-style.mjs`](lib/map-style.mjs), and never send it; the report counts it under `servedLocally`. The stand-in is a plain background in the theme's colour with no sources, no sprite and no glyphs URL, so MapLibre asks for no tiles, sprites or fonts.

On that background the app's own map layers draw on the synthetic data: the district outlines and their name labels, the markers, polygons and choropleths of each data layer switched on in the layer rail, and their popups on hover or click. MapLibre draws label text itself from the browser's local fonts, as it does for any style without a glyphs URL, so labels show in the local sans-serif rather than the live site's map font.

What the map still can't show:

- the base map itself: no streets, water, parks, boundaries or place names, so markers sit on a plain background, and the roads and water areas the traffic and water layers highlight are not there to highlight;
- the WMS overlays (rent map and noise map, from gdi.berlin.de and geodienste.hamburg.de), which stay blocked;
- the rain radar, which is not mounted in synthetic mode ([dev-database.md](../.context/dev-database.md)). Its map layer is on by default and still asks the run's own API for `/api/weather-tiles/<z>/<x>/<y>.png`, which answers 404, so about ten failed requests to the run's own server per page are expected; the report lists them with the page's failed requests.

### Blocked, as expected

The browser aborts every other request that is not to the run's own web server. The WMS overlays and the analytics script (`scripts.simpleanalyticscdn.com`) show up under blocked hosts, and so would CARTO's tile, font and sprite hosts if anything asked for them.

## Guard

Every process the run starts gets an environment built from nothing:

- from the shell, only `PATH` (and `SYSTEMROOT`, `COMSPEC` on Windows);
- `HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` and `TMPDIR` (on Windows also `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP`) under the run folder;
- `HTTP_PROXY`, `HTTPS_PROXY` and their lowercase forms on a closed loopback port;
- the invented values in [`fixture-vars.json`](fixture-vars.json): `NO_PROXY=127.0.0.1,localhost`, `NODE_USE_ENV_PROXY=1` (so Node's own fetch uses the closed proxy), `LANG`, `TZ`;
- for the seed and the API, `SYNTHETIC_DATABASE_URL` naming the run's Postgres, and for the API `PORT`.

Before anything starts, the parent checks each of those environments, and each server process checks its own again before it imports product code (`lib/product-child.mjs`, `lib/web-build.mjs`):

- it holds only those names, each with the value the harness set; any other name (as a dotenv file would add) is refused;
- every variable the product's configuration code reads (`PRODUCT_CONFIG_VARS` in `lib/guard.mjs`, kept complete by `test/config-vars.test.mjs`) and the PG\*, OpenAI and LangChain variables its libraries read are unset, except the database URL and port the harness set;
- the database URL is `harness@127.0.0.1:<the run's port>/city_monitor_dev` with no query parameters. Unset is refused too, since the product would fall back to the docker-compose database on localhost:5434;
- in the server processes: the URL the product itself resolves (`syntheticDatabaseUrl`) passes that check and the product's own `assertLocalDatabaseUrl`; `blockExternalFetch` is on and a fetch to another host is refused; the OpenAI client is not configured (no key); in the API, every server binds 127.0.0.1 and the API listens on the picked port. The server has no mail, payment, storage or analytics client;
- in the seed process, once the seed script has finished and before a scenario other than `default` opens the database itself: the URL the product resolves passes both checks again, and the connection comes from the product's `openLocalDatabase`, which runs `assertLocalDatabaseUrl` once more. The scenario's statements name the `snapshots` table, the run's city and a snapshot type, and run in one transaction;
- the seed and the API refuse a guard file that names no valid city id, and the web build one whose active cities are not valid ids.

Postgres is checked through its `postmaster.pid`: the process the harness started, its port, 127.0.0.1 only, no Unix socket.

In the browser, every request outside the run's web server is aborted, except the base map's style, which the route answers from memory without sending it ("The map"); WebSockets are closed, service workers are blocked, and Chromium's proxy is the closed port with only loopback bypassing it.

On success the run prints exactly one line `hermetic-guard: ok port <web port>`. A refusal prints `hermetic-guard: refused: <what>` (names, never values) and exits 2.

### Negative test

`--guard-test=<case>` plants a case after the environment was cleared, where the seed reads its database target, and the run must exit 2:

| Case | Plants | Refused |
|---|---|---|
| `env` | `GUARD_TEST_UNLISTED=planted` | before anything starts or is written |
| `target` | `SYNTHETIC_DATABASE_URL=postgres://guard-test.invalid/x` | before anything starts or is written |
| `target-loopback` | `SYNTHETIC_DATABASE_URL=postgres://127.0.0.1:9/x` | before anything starts or is written |
| `network` | one GET to `https://example.com/`, from the browser and from a Node process with the cleared environment | after both requests failed; creates a run folder with a browser profile |

If a planted case got through, the run would carry on as a normal run, so a guard-test run that does not exit 2 means the guard is broken.

`node --test harness/test/*.test.mjs` runs the harness's unit tests (the guard refusing each case, the allowlist, port picking, the static server, the listen guard, the parameter checks, the `--out` checks against the checkout and the main checkout, the base map's stand-in and the browser's routes answering it locally while aborting everything else, the cities: reading both registries, making the run's city the active one in the build only, and `see.mjs` exiting 1 with the list for an unknown city; and the scenarios: their names, `see.mjs` exiting 1 with the list for an unknown one, the types left out for a city without them, and each scenario applied to the real seed's rows of Berlin and of Hamburg, checked against the shared schemas and the app's stale limits, with the statements a run would send). They start no database, API, build or browser; the scenario test loads the product's TypeScript through tsx in a child process and connects to nothing. `npm test` does not run them.

## Running as root

`initdb` and `postgres` refuse to run as root. As root, the harness runs them through `unshare --user --map-user=<uid> --map-group=<gid>`, a user namespace in which root appears as `--pg-user` (default `postgres`, looked up in `/etc/passwd`). The files stay root's on disk, so a run folder whose parent folders only root may enter (a 0700 scratch folder) works and nothing is chowned. This needs `unshare` from util-linux and user namespaces enabled. The server still listens on 127.0.0.1 only and asks for the run's random password.
