# Contributing to City Monitor

Thanks for your interest in contributing! This page takes you from a fresh clone to a pull request that is ready for review: the setup, which docs to read for your change, the rules UI changes follow, the checks, and what happens when you open the pull request.

[Before you start](#before-you-start) · [Set up](#set-up) · [Find the docs for your change](#find-the-docs-for-your-change) · [Rules for UI changes](#rules-for-ui-changes) · [Run the checks](#run-the-checks) · [Open a pull request](#open-a-pull-request) · [Three good first changes](#three-good-first-changes) · [Design choices that look like bugs](#design-choices-that-look-like-bugs) · [Contributor License Agreement](#contributor-license-agreement)

## Before you start

- **Small fixes can go straight to a pull request:** a bug fix, a wrong or missing translation, a missing test, a docs correction.
- **Open an issue first** for a new feature, a larger change or a new data source, so the approach is agreed before you build it. There are forms to [report a bug](https://github.com/OdinMB/city-monitor/issues/new?template=bug_report.yml) and to [propose a data source](https://github.com/OdinMB/city-monitor/issues/new?template=data_source.yml); anything else can be a blank issue.
- **Read [Design choices that look like bugs](#design-choices-that-look-like-bugs)** before you change how data is fetched, stored or served. Some of what looks wrong there is deliberate.
- **Some changes only the maintainer makes**: deployment, CI, environment variables, AI models and prompts, database migrations and new paid API calls. [That list](#changes-only-the-maintainer-makes) says how to propose one.

## Set up

You need:

- **Node** at the version in [`.nvmrc`](.nvmrc) (`nvm use` reads it). CI uses the same file. On an older Node, `npm ci` prints an `EBADENGINE` warning.
- **Docker**, only for the synthetic database below. Nothing else needs it.

You don't need API keys, a `.env` file or access to a production database.

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/<your-username>/city-monitor.git
cd city-monitor
npm ci    # installs what package-lock.json pins, without changing it
```

### Run it on synthetic data (recommended)

Docker runs a local Postgres, a seed script fills it with made-up Berlin data for every tile and map layer, and the API serves it with no cron jobs and no outbound requests:

```bash
docker compose up -d db                 # Postgres 17 on localhost:5434
npm run db:seed                         # migrate it and fill it with synthetic data
npm run dev:synthetic                   # API on port 3001
npm run dev --workspace=packages/web    # in a second terminal: the web app on http://localhost:5173
```

- `db:seed` wipes that database on every run. It refuses any database other than `city_monitor_dev` on localhost.
- Port 3001 must be free, so stop a running `npm run dev` first.
- The data is dated when you seed it, and some tiles go empty after a few hours (noise sensors after two). Seed again and restart `dev:synthetic`.
- If the seed stops with "relation already exists", the volume was set up with `db:push`: run `docker compose down -v` and start over.
- Only Berlin is seeded. The browser still loads the base map and some map overlays from the internet.

Details: [`.context/dev-database.md`](.context/dev-database.md).

### Run it on live data

`npm run dev` starts the web app (port 5173) and the API (port 3001) together. With no database the API runs cache-only, and every ingestion job fetches from the real public sources when the server starts. Jobs whose source needs a key are skipped without it, so their tiles stay empty, and the news tile stays empty without `OPENAI_API_KEY`. [`.context/deployment.md`](.context/deployment.md#environment-variables) lists every variable and what it gates. Never commit a `.env` file or a key.

For screenshots in every language and theme without Docker, `node harness/see.mjs --out <folder outside the checkout>` runs the app on synthetic data in headless Chromium. It needs Postgres server binaries and an installed Playwright: [`harness/README.md`](harness/README.md).

## Find the docs for your change

The [`.context/`](.context/) folder holds the project's working docs: how each part works, the rules it follows and the tests that guard them. Read the file for your area before you change it. ([`CLAUDE.md`](CLAUDE.md) lists the same files with a one-line summary each.)

**Anywhere**

- Writing or running tests, or a test that fails in a confusing way: [testing.md](.context/testing.md)
- The synthetic database, or a new kind of stored data it must generate: [dev-database.md](.context/dev-database.md)

**Server and data**

- App startup, cron jobs and their schedules, routes, logging, the health and bootstrap endpoints, city config: [server.md](.context/server.md)
- The cache, database tables, reads and writes, cache warming, data retention: [data-layer.md](.context/data-layer.md)
- A new data source, with its checklist of every place it touches: [new-data-sources.md](.context/new-data-sources.md)
- Turning place names into coordinates: [geocoding.md](.context/geocoding.md)

**Web app**

- Components, layout, the map, colours, accessibility, browser storage: [frontend.md](.context/frontend.md)
- UI text, translations, plurals, the Arabic layout: [i18n.md](.context/i18n.md)

**One data area**

- News feeds, the AI classifier, the daily briefing: [news.md](.context/news.md)
- Anything that shows, labels or serves AI output (update it in the same change): [ai-transparency.md](.context/ai-transparency.md)
- Weather, weather warnings, UV, air quality: [weather.md](.context/weather.md)
- Transit disruptions: [transit.md](.context/transit.md)
- Police reports, events: [events-safety.md](.context/events-safety.md)
- River levels, bathing water: [water-levels.md](.context/water-levels.md)
- Social atlas map, unemployment tile: [social-atlas.md](.context/social-atlas.md)
- Wastewater: [wastewater.md](.context/wastewater.md)
- Population: [population.md](.context/population.md)
- Fire brigade: [feuerwehr.md](.context/feuerwehr.md)
- Pollen: [pollen.md](.context/pollen.md)
- Noise maps and sensors: [noise.md](.context/noise.md)
- Council meetings: [council-meetings.md](.context/council-meetings.md)

**The maintainer's areas** (read, then [propose](#changes-only-the-maintainer-makes))

- Build scripts, CI, environment variables, the CSP: [deployment.md](.context/deployment.md)
- Running your own instance on Render: [deploy-on-render.md](.context/deploy-on-render.md)
- LLM models, reasoning effort and prompts: [model-eval.md](.context/model-eval.md)
- The licence and the source-code footer: [licensing.md](.context/licensing.md)

## Rules for UI changes

Most changes to the web app touch at least one of these. Each has tests that fail when it's broken, but it's quicker to know them up front.

- **Four languages.** Every visible string goes through `t()`, with its key in all four locale files: `packages/web/src/i18n/en.json`, `de.json`, `tr.json` and `ar.json`. A string with a number takes `count` and i18next plural keys, and Arabic needs all six forms (`plurals.test.ts`). Dates and numbers are formatted in `i18n.language`. The AI disclosure strings (`aiLabel.*`, `aiNotice.*`, `sources.aiProcessing.*`) are approved word for word: don't reword them. See [i18n.md](.context/i18n.md).
- **Right-to-left.** Arabic pages are `dir="rtl"`, and only logical sides mirror: use `ps-`/`pe-`, `ms-`/`me-`, `text-start`/`text-end`, `inset-s-`/`inset-e-`, `border-s`/`border-e` and `rounded-s`/`rounded-e`, never `pl-`, `ml-`, `text-left`, `right-0` and the like (`logical-sides.test.ts` fails on them). German feed text in an Arabic page goes in a `<bdi>`, or gets `dir="auto"` where it is truncated. Phone numbers and number ranges go in `<Ltr>`, and "more" arrows come from `forwardArrow()`. See [i18n.md, Right-to-left](.context/i18n.md#right-to-left-arabic).
- **Colour roles.** A colour that means something comes from a role defined once for light and dark in `globals.css`: `text-link`, `text-muted`, `text-positive`, `bg-signal-good`, `badge-good`, `tag-news-<category>` and the rest. Write the role, not a palette class with a `dark:` partner (`colour-roles.test.ts`). See [frontend.md, Theme System](.context/frontend.md#theme-system).
- **WCAG 2.2 AA.** Text reaches 4.5:1 against its background in both themes (secondary text is `text-muted`; `text-gray-400` on white is only 2.6:1). Tap and click targets are at least 24×24 CSS px. A state is never shown by colour alone, and focus outlines are not clipped. See [frontend.md, Layout](.context/frontend.md#layout).

Two more you'll meet: map popups are HTML strings, so every value from a feed goes through `escapeHtml()` and every link through `safeUrl()` ([frontend.md, Map](.context/frontend.md#map-packageswebsrccomponentsmapcitymaptsx)); and every `localStorage` call sits in a `try`/`catch`, with a new key also listed on the Privacy page ([frontend.md, Browser Storage](.context/frontend.md#browser-storage)).

## Run the checks

All three must pass before you open the pull request. CI runs the same ones.

```bash
npm run typecheck
npm run lint
npm test
```

`npm test` builds `shared`, then runs both packages' Vitest suites (about 1,000 web and 830 server tests) through Turborepo. To run one test file, give Turborepo the package and the path from the package's folder:

```bash
npx turbo run test --filter=@city-monitor/web -- src/components/strips/NewsStrip.test.tsx
npx turbo run test --filter=@city-monitor/server -- src/lib/parse-history.test.ts
```

You can also run `npx vitest run <path>` from inside `packages/web` or `packages/server`. Server tests need a built `shared` then: run `npm run build --workspace=shared` once.

> **Don't run `npx vitest run <path>` from the repository root.** It doesn't pick up the package's Vitest config, so web tests run without their jsdom environment and setup file and fail for reasons that have nothing to do with your change.

- Tests sit next to the code they test (`Foo.tsx` → `Foo.test.tsx`) and use explicit assertions, not snapshots. More in [testing.md](.context/testing.md).
- The web test setup switches the app to English, so tests assert English text.
- CI has no API keys or secrets, so a test must not need one or call a live API: mock `fetch`, as the existing tests do.
- `harness/` has its own suite outside `npm test`: `node --test harness/test/*.test.mjs`, if you change it.

## Open a pull request

- Work on a branch of your fork, based on `main`, and open the pull request against `main`. One change per pull request.
- Sign off every commit with `git commit -s`. That is how you agree to the [contribution terms](#contributor-license-agreement).
- Fill in the checklist in the pull request template. It lists the project's gates that are easy to miss.
- For a visible change, add before and after screenshots, in Arabic too if the layout changed.

### Commit messages

Most of the history uses one style: a single line in the imperative, starting with a capital letter, with no type prefix and no full stop, saying what changes for someone using the site or working on the code. A body below it explains what the line can't. From the log:

- `Show today's DWD UV index on the weather tile again`
- `Keep population cache entries until the next monthly run`
- `Skip Berlin-only cron jobs when Berlin is not active`

The newest commits add a type prefix such as `feat:` or `fix:`; no check requires one.

### What CI does

Every pull request against `main` runs the [CI workflow](.github/workflows/ci.yml) on GitHub Actions. It has four jobs, each starting with `npm ci` on the Node version in `.nvmrc`: `typecheck`, `lint`, `test`, and `build`, which runs once `typecheck` has passed. The jobs get a read-only token and no secrets, and nothing they build is deployed: the live site is built from `main` after a merge.

GitHub may hold the runs for a first-time contributor's pull request until a maintainer approves them. The checks then show as waiting. That isn't a failure, and you don't need to push again.

## Three good first changes

### Fix a translation

1. Find the key: search `packages/web/src/i18n/en.json` for the English text you see, or `de.json` for the German. The same key path is in all four files.
2. Correct the value in each file where it's wrong. A new key goes in all four. Keep `{{placeholders}}` as they are, and give a string with `{{count}}` its plural forms (six in Arabic).
3. Leave `aiLabel.*`, `aiNotice.*` and `sources.aiProcessing.*` alone. That copy is approved word for word, and `src/test-fixtures/approved-ai-copy.ts` holds it.
4. Search for the key under `packages/web/src` to find the component and its test, and run that test with the plural check. For a map popup word:

```bash
npx turbo run test --filter=@city-monitor/web -- src/i18n/plurals.test.ts src/components/map/layers/popup-language.test.ts
```

Many tests assert the English text, so a change to `en.json` can need a test updated in the same commit.

If a Turkish or Arabic string reads wrong to you, open an issue that quotes it and says what it should say. That goes for the AI disclosure strings too: they stay word for word in a pull request.

### Add a parser edge-case test

Each ingestion job, `packages/server/src/cron/ingest-*.ts`, turns an outside response into the types in `shared/types.ts`. Many export that parsing step as a pure function, such as `parseDwdPollenJson` in `ingest-pollen.ts` or `parseDwdUv` in `ingest-weather.ts`, and the `ingest-*.test.ts` file next to it feeds it small invented payloads.

1. Read the parser and its test, and pick a case the test doesn't cover yet: a missing field, an empty list, a value of the wrong type, a format the source has used.
2. Add an `it(...)` with a minimal invented payload (never copied personal data) and the result you expect.
3. Run that file:

```bash
npx turbo run test --filter=@city-monitor/server -- src/cron/ingest-pollen.test.ts
```

If the test shows a real bug, fix it in the same pull request. A test that fails on `main` and passes with your fix is the best evidence.

### Credit a source on the Sources page

The Sources page (`/berlin/sources`) lists every data source with a link. The entries are in `packages/web/src/pages/SourcesPage.tsx`: `SHARED_SOURCES` for every city, `BERLIN_SOURCES` and `HAMBURG_SOURCES` per city, grouped by category. They are in English in every UI language; only the AI section is translated.

1. Add or correct the `{ name, url, description }` entry in the right group, with the attribution wording the source's licence or terms ask for.
2. If the licence prescribes exact wording, pin it with an assertion in `SourcesPage.test.tsx`, as the CAMS and WAQI credits are.
3. Run:

```bash
npx turbo run test --filter=@city-monitor/web -- src/pages/SourcesPage.test.tsx
```

If the browser loads anything from the source's own host (map tiles, a WMS overlay), that host also needs a place in the CSP in `render.yaml` and a row on the Privacy page. The CSP is the maintainer's call, so say so in the pull request.

## Design choices that look like bugs

These are intentional. If you think one should change, open an issue and make the case there before writing code.

- **Ingestion writes the cache first, then Postgres.** Each cron job puts its result in the in-memory cache, then saves it to the database inside a `try`/`catch`. A failed save is logged and the job carries on. So the API serves new data as soon as it is fetched, whether or not there is a database and whether or not the save worked. Postgres is what the cache is warmed from after a restart, and what the routes fall back to when a cache entry has expired. Keep the order, and keep a failed save non-fatal ([data-layer.md, Patterns](.context/data-layer.md#patterns)).
- **Postgres is optional.** Without `DATABASE_URL` the server runs cache-only: everything lives in memory, every ingestion job runs when the server starts, and nothing survives a restart. That is how the app runs with no setup at all, so new server code must work when `db` is `null`; the existing jobs and routes guard every database call.
- **No server-side rendering.** The web app is a Vite single-page app, and the dashboard renders in the browser from the API's JSON. Per-city page meta and the sitemap are written at build time.
- **No WebSocket or server-sent events.** The data changes only when a cron job runs (the most frequent every 5 minutes), so the web app polls with React Query.
- **No accounts or login.** The dashboards show public data to everyone. There is nothing to sign in to, and the few settings (theme, language, dismissed hints and warnings) stay in the browser.
- **Every news item goes through an AI classifier.** Each new item from every feed is sent to an OpenAI model that judges its relevance, category and importance. So a feed whose licence or terms forbid AI input can't be added at all: BZ Berlin was removed for exactly that and must not come back. Check a feed's terms, its `robots.txt` and any RSL licence file before you propose it ([news.md, Feed Configuration](.context/news.md#feed-configuration)).

### Changes only the maintainer makes

Even when the code change is small, these come from the maintainer:

- deployment config: `render.yaml`, including its Content-Security-Policy header, and the build and start commands;
- environment variables: adding one, renaming one or changing what one does;
- CI: anything in `.github/workflows/`;
- the LLM model, reasoning effort or prompts: each change needs a rerun of the paid model-eval harness, `npm run eval:models` ([model-eval.md](.context/model-eval.md));
- database migrations: a new table or column (`packages/server/src/db/schema.ts`, `packages/server/drizzle/`). A new snapshot type is only a value in `SNAPSHOT_TYPES` and needs none;
- new paid API calls: anything that costs money per call or needs a paid account.

To suggest one, open an issue that describes the change and what it is for. For a new data source, use the [data source form](https://github.com/OdinMB/city-monitor/issues/new?template=data_source.yml).

## Code Style

- Follow existing patterns in the codebase
- TypeScript strict mode is enabled — no `any` types (tests may use `as any` for partial mocks)

## Contributor License Agreement

You keep the copyright in your contribution. By submitting one (a pull request, or code or text you send for inclusion in the project), you agree to these terms:

- **Everyone can use it under AGPL-3.0-or-later.** You license your contribution to everyone under the GNU Affero General Public License, version 3 or any later version, the same licence as the rest of the project.
- **The maintainer and successor stewards can relicense it.** You also grant Odin Mühlenbein, the project's maintainer, and any successor steward of the project a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to use, copy, modify, distribute, sublicense and relicense your contribution under other terms, including other open-source licences. This lets the project change its licence or pass to a new steward without having to ask every past contributor.
- **You have the right to make it.** The contribution is your own work, or you have the right to submit it under these terms (if an employer or client owns your work, they have agreed), and to your knowledge it doesn't infringe anyone else's rights.

You confirm this by signing off every commit in your pull request: `git commit -s` adds the line `Signed-off-by: Your Name <you@example.com>`, with the name and email from your git config. Commits without a sign-off aren't merged. There is nothing else to sign.
