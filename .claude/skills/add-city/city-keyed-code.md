# Code that names a city outside the city configs

Every place outside `packages/*/src/config/cities/` that is keyed by a city ID, or that hard-wires Berlin, with what a new city needs there. `git grep -nw berlin -- 'packages/*/src/*' 'packages/web/vite*' ':!*.test.*'` (README, "Adding a City", step 9) finds anything this list misses.

`packages/web/src/config/add-city-skill.test.ts` reads this table. Keep one row per place, with the text to find and the file (from the repo root) in backticks. The test fails when a file is gone, when the text is no longer in it, or when a file marked `every city` or `every DE city` does not mention a configured city's ID.

| Find | In | Entry needed for | Without one |
|---|---|---|---|
| `ALL_CITIES` | `packages/server/src/config/index.ts` | every city | The server never loads the config. |
| `CITY_PLZ` | `packages/server/src/cron/ingest-pharmacies.ts` | every DE city | No emergency pharmacies: aponet.de is searched by one central postcode. The city has no `pharmacies` feature, so no pharmacy sub-layer or aponet.de credit. |
| `CITIES` | `packages/server/src/scripts/check-weather-sources.ts` | every city | `npm run check:weather -- --city <id>` stops with "Unknown city". |
| `PARLIAMENT_CONFIG` | `packages/server/src/cron/ingest-political.ts` | every DE city | No political data. A city inside a state needs `constituencies`, or it counts the whole state parliament as its own (SKILL.md, "City-state assumptions"). |
| `BEZIRKSBUERGERMEISTER` | `packages/server/src/cron/ingest-political.ts` | optional | No district mayors. Hand-maintained with source page and verification date; Berlin and Köln. |
| `OBERBUERGERMEISTER` | `packages/server/src/cron/ingest-political.ts` | optional | No City Hall view in the political tile. Hand-maintained like the district mayors; Köln and München. |
| `STATE_CONSTITUENCY_BEZIRKE` | `packages/server/src/cron/ingest-political.ts` | optional | The state members are not grouped by Bezirk: the political tile's state view reads them by constituency, and the map has no state-parliament view. Only for a city whose state constituencies are named after its Bezirke (Berlin). |
| `BERLIN_OWN_SOURCES` | `packages/server/src/lib/city-features.ts` | Berlin only | The fire brigade counts as a feature of Berlin alone, as its job fetches for it alone. Bathing, wastewater, labour market, social atlas and population are config entries (`dataSources.bathing`, `.wastewater`, `.laborMarket`, `.socialAtlas`, `.population`). |
| `BERLIN_ONLY_JOBS` | `packages/server/src/app.ts` | Berlin only | Fire brigade: Berlin's own source, stored under `berlin`. |
| `cityId === 'berlin'` | `packages/server/src/db/warm-cache.ts` | Berlin only | Restores those jobs' data, noise sensors and council meetings for Berlin alone. |
| `cityArg === -1 ? 'berlin'` | `packages/server/src/dev-synthetic.ts` | nothing | Synthetic mode, and the guarded browser run built on it, serve one configured city per run: Berlin by default, any other with `--city <id>` after `npm run db:seed -- --city <id>` (`.context/dev-database.md`). |
| `ALL_CITIES` | `packages/web/src/config/index.ts` | every city | The web never loads the config. |
| `ACTIVE_CITY_IDS` | `packages/web/src/config/index.ts` | when activating | `/<id>` goes to the city picker at `/` (or to the one city when only one is active). |
| `WAQI_AGENCIES` | `packages/web/src/lib/aqi.ts` | every city | WAQI is credited without the state's monitoring agencies, which its terms require (`.context/weather.md`, "Credit"). |
| `CITY_SOURCES` | `packages/web/src/pages/SourcesPage.tsx` | every city | The Sources page lists only the sources every city shares. |
| `[data-city=` | `packages/web/src/globals.css` | every city | The default blue accent. Add a light block and a `.dark` block. |
| `DISTRICT_URLS` | `packages/web/src/components/map/constants.ts` | optional | No district outlines on the map and no political map layer, which needs them (`politicalMap`, `config/index.test.ts`; SKILL.md, "City-state assumptions"). The GeoJSON goes in `packages/web/src/data/districts/<cityId>-bezirke.geojson` in WGS84, simplified to tens of KB (mapshaper, installed outside the repo); check its licence and credit it on the Sources page. Add the Bezirke with a point inside each to `CITY_DETAILS` in `synthetic/generate.ts`: `generate.test.ts` checks every file there against them. |
| `NOISE_WMS_BASE` | `packages/web/src/components/map/constants.ts` | optional | No noise map (`NOISE_WMS_LAYERS` beside it, the credit in `NOISE_WMS_ATTRIBUTION`; the web config's `noiseMap` and `noiseTotal` features must match, `config/index.test.ts` checks). Its host needs the `SERVICES` and `connect-src` rows below. |
| `RENT_MAP_WMS` | `packages/web/src/components/map/constants.ts` | optional | No rent map: an official Wohnlagen WMS with its layer, credit and legend classes (Berlin's Wohnlagenkarte, Hamburg's Wohnlagenverzeichnis). The web config's `rentMap` feature must match, `config/index.test.ts` checks. Its host needs the `SERVICES` and `connect-src` rows below. |
| `SOCIAL_ATLAS` | `packages/web/src/lib/social-atlas.ts` | with `dataSources.socialAtlas` | The social layer has no indicator sub-layers: each city's entry names its provider, edition, status index and its own label per indicator (`socialAtlas.indicator.*` in all four bundles), colour stops where the default ramp does not fit its range, and `areas` (`socialAtlas.areas.*`) when its areas are far coarser than the others', as München's 25 Stadtbezirke. `config/index.test.ts` checks it against the server config. The server's outline file goes in `packages/server/data/` (`.context/social-atlas.md`, "Outline files"). |
| `SKYLINES` | `packages/web/src/components/skylines/CitySkyline.tsx` | optional | The generic skyline. A drawing goes in its own file beside it; `Skyline.tsx` says how (landmarks between x 260 and 940, readable at true proportions and stretched, overlap shapes that touch). |
| `SERVICES` | `packages/web/src/pages/PrivacyPage.tsx` | per browser host | A host the browser loads from (WMS layers, tiles) must be named here and in the CSP; `PrivacyPage.test.tsx` checks the two agree. |
| `connect-src` | `render.yaml` | per browser host | The browser refuses a host the CSP's `connect-src` and `img-src` don't name. Deploy configuration. |
| `ACTIVE_CITIES` | `render.yaml` | when activating | The blueprint's default, `berlin,hamburg,koeln,muenchen`. The deployment's owner sets the live value. |
| `CITY_META` | `packages/web/src/lib/seo-pages.ts` | when activating | The web build fails once the city is active: `/<id>` and `/<id>/sources` are pre-rendered and in the sitemap, with their title, description and share image, from this entry. Köln and München have theirs. |
| `IMAGES` | `packages/web/scripts/generate-og-images.ts` | when activating | No `packages/web/public/og-<id>.png` to share, and the web build fails once the city is active. Köln and München have entries, not yet their images: `npm run generate:og` in `packages/web` makes them (it fetches its font, so it needs the network). |
| `FAVICON_SLUGS` | `packages/web/src/lib/news-favicons.ts` | per feed | `news-favicons.test.ts` fails (`.context/news.md`, "Favicons"). |
| `FAVICON_SOURCES` | `packages/web/scripts/fetch-favicons.ts` | per feed | No icon to download for the feed. |

## Tests that list cities by hand

Extend these when you add a city; nothing fails if you forget.

- `packages/server/src/config/config.test.ts`, "every configured city": the `ACTIVE_CITIES` stub and the ID list. Without the new ID, its centre, bounds and NINA key go unchecked.
- `packages/web/src/config/index.test.ts`: the `cities` list in "every configured city", and "active cities".
- `packages/web/src/lib/aqi.test.ts`: the `it.each` over cities in "WAQI originating agencies".
- `packages/web/src/App.test.tsx`: one "sends /<id> to the city picker" test per inactive city (none today), and one "renders the … dashboard at /<id>" test per active one. Change it when the city goes live.
- `packages/web/src/components/map/layers/political-matching.test.ts`: one entry per city with district GeoJSON.
- `packages/web/src/App.default-city.test.tsx` mocks Berlin and Hamburg only, which is enough unless the default-city rule changes.

These need no edit, because they read the city folders or the files they compare: the web and server parity tests in `packages/web/src/config/index.test.ts`, `packages/web/src/lib/news-favicons.test.ts` (every configured feed has an icon), `packages/web/src/pages/PrivacyPage.test.tsx` (`SERVICES` against the CSP) and `packages/web/src/config/add-city-skill.test.ts` (this table against the code).
