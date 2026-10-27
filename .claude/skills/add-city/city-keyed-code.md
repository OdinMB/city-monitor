# Code that names a city outside the city configs

Every place outside `packages/*/src/config/cities/` that is keyed by a city ID, or that hard-wires Berlin, with what a new city needs there. `git grep -nw berlin -- 'packages/*/src/*' 'packages/web/vite*' ':!*.test.*'` (README, "Adding a City", step 9) finds anything this list misses.

`packages/web/src/config/add-city-skill.test.ts` reads this table. Keep one row per place, with the text to find and the file (from the repo root) in backticks. The test fails when a file is gone, when the text is no longer in it, or when a file marked `every city` or `every DE city` does not mention a configured city's ID.

| Find | In | Entry needed for | Without one |
|---|---|---|---|
| `ALL_CITIES` | `packages/server/src/config/index.ts` | every city | The server never loads the config. |
| `CITY_PLZ` | `packages/server/src/cron/ingest-pharmacies.ts` | every DE city | No emergency pharmacies: aponet.de is searched by one central postcode. The job only logs a warning. |
| `CITIES` | `packages/server/src/scripts/check-weather-sources.ts` | every city | `npm run check:weather -- --city <id>` stops with "Unknown city". |
| `PARLIAMENT_CONFIG` | `packages/server/src/cron/ingest-political.ts` | city-states | No political data. An entry counts every member of the state parliament as the city's (SKILL.md, "City-state assumptions"). |
| `BEZIRKSBUERGERMEISTER` | `packages/server/src/cron/ingest-political.ts` | optional | No district mayors. Hand-maintained, Berlin only. |
| `admin_level` | `packages/server/src/cron/ingest-aeds.ts` | city-states | The Overpass query looks for a state-level area with the city's name, so a city inside a state gets no AEDs. |
| `BERLIN_ONLY_JOBS` | `packages/server/src/app.ts` | Berlin only | Bathing, wastewater, labour market, population and fire brigade: Berlin's own sources, stored under `berlin`. |
| `cityId === 'berlin'` | `packages/server/src/db/warm-cache.ts` | Berlin only | Restores those jobs' data, noise sensors and council meetings for Berlin alone. |
| `cityArg === -1 ? 'berlin'` | `packages/server/src/dev-synthetic.ts` | nothing | Synthetic mode, and the guarded browser run built on it, serve one configured city per run: Berlin by default, any other with `--city <id>` after `npm run db:seed -- --city <id>` (`.context/dev-database.md`). |
| `ALL_CITIES` | `packages/web/src/config/index.ts` | every city | The web never loads the config. |
| `ACTIVE_CITY_IDS` | `packages/web/src/config/index.ts` | when activating | `/<id>` redirects to Berlin. |
| `WAQI_AGENCIES` | `packages/web/src/lib/aqi.ts` | every city | WAQI is credited without the state's monitoring agencies, which its terms require (`.context/weather.md`, "Credit"). |
| `CITY_SOURCES` | `packages/web/src/pages/SourcesPage.tsx` | every city | The Sources page lists only the sources every city shares. |
| `[data-city=` | `packages/web/src/globals.css` | every city | The default blue accent. Add a light block and a `.dark` block. |
| `DISTRICT_URLS` | `packages/web/src/components/map/constants.ts` | optional | No district outlines on the political layer. The GeoJSON goes in `packages/web/src/data/districts/`; check its licence. |
| `NOISE_WMS_BASE` | `packages/web/src/components/map/constants.ts` | optional | No noise map (`NOISE_WMS_LAYERS` beside it). Its host needs the `SERVICES` and `connect-src` rows below. |
| `LAYER_META` | `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Berlin only | `cities: ['berlin']`, here and in `NOISE_SUB_META`, keeps the social atlas (with the rent map), population and total-noise toggles to Berlin; `CityMap.tsx` checks the ID again. Every other toggle shows for every city, with or without data. |
| `cityId === 'berlin'` | `packages/web/src/components/layout/CommandLayout.tsx` | Berlin only | Wastewater, Fire Department, Unemployment, Population, Crisis Services and Council Meetings tiles. |
| `BerlinSkyline` | `packages/web/src/components/layout/SkylineSeparator.tsx` | optional | The generic skyline. |
| `/berlin/sources` | `packages/web/src/pages/PrivacyPage.tsx` | Berlin only | The privacy page links Berlin's Sources page. |
| `SERVICES` | `packages/web/src/pages/PrivacyPage.tsx` | per browser host | A host the browser loads from (WMS layers, tiles) must be named here and in the CSP; `PrivacyPage.test.tsx` checks the two agree. |
| `connect-src` | `render.yaml` | per browser host | The browser refuses a host the CSP's `connect-src` and `img-src` don't name. Deploy configuration. |
| `ACTIVE_CITIES` | `render.yaml` | when activating | The blueprint's default, `berlin`. The deployment's owner sets the live value. |
| `DASHBOARD_ROUTES` | `packages/web/vite-plugin-seo.ts` | when activating | `/<id>` is not pre-rendered or in the sitemap. |
| `ogImage` | `packages/web/vite.config.ts` | when activating | `/<id>` and `/<id>/sources` get no title, description or share image. |
| `IMAGES` | `packages/web/scripts/generate-og-images.ts` | when activating | No `packages/web/public/og-<id>.png` to share. |
| `FAVICON_SLUGS` | `packages/web/src/lib/news-favicons.ts` | per feed | `news-favicons.test.ts` fails (`.context/news.md`, "Favicons"). |
| `FAVICON_SOURCES` | `packages/web/scripts/fetch-favicons.ts` | per feed | No icon to download for the feed. |

## Tests that list cities by hand

Extend these when you add a city; nothing fails if you forget.

- `packages/server/src/config/config.test.ts`, "every configured city": the `ACTIVE_CITIES` stub and the ID list. Without the new ID, its centre, bounds and NINA key go unchecked.
- `packages/web/src/config/index.test.ts`: the `cities` list in "every configured city", and "active cities".
- `packages/web/src/lib/aqi.test.ts`: the `it.each` over cities in "WAQI originating agencies".
- `packages/web/src/App.test.tsx`: one "redirects /<id> to /berlin" test per inactive city. Change it when the city goes live.
- `packages/web/src/components/map/layers/political-matching.test.ts`: one entry per city with district GeoJSON.
- `packages/web/src/App.default-city.test.tsx` mocks Berlin and Hamburg only, which is enough unless the default-city rule changes.

These need no edit, because they read the city folders or the files they compare: the web and server parity tests in `packages/web/src/config/index.test.ts`, `packages/web/src/lib/news-favicons.test.ts` (every configured feed has an icon), `packages/web/src/pages/PrivacyPage.test.tsx` (`SERVICES` against the CSP) and `packages/web/src/config/add-city-skill.test.ts` (this table against the code).
