# Deployment & CI/CD

## Hosting: Render.com

Infrastructure defined in `render.yaml` (Blueprint spec).

### Services

| Service | Type | Plan | Region |
|---|---|---|---|
| `city-monitor-db` | PostgreSQL | Starter ($7/mo) | Frankfurt |
| `city-monitor-api` | Web (Node) | Starter ($7/mo) | Frankfurt |
| `city-monitor-web` | Static Site | Free | — |

### API Server

- **Build:** `npm ci --include=dev && npm run build --workspace=shared && npm run build --workspace=packages/server`
- **Start:** `npm run db:migrate --workspace=packages/server && node packages/server/dist/index.js`
- **Health check:** `GET /api/health`
- **Auto-deploy:** On push to `main`
- Migrations run automatically on each deploy (in start command)

### Client address and `trust proxy`

Requests reach the API through Render's proxies, so the socket address is a proxy's. Express's `trust proxy` is a hop count, `TRUST_PROXY_HOPS` in `packages/server/src/app.ts`: `req.ip`, which the rate limits count by, is the `X-Forwarded-For` entry that many places from the right. Too low puts every visitor in one proxy's rate-limit bucket; too high lets a caller pick their own address with a forged header, and only a forged header shows it.

It is **2**. Measured on 2026-10-26 with a forged `X-Forwarded-For` (a temporary check page, since removed):

| Path into the API | Hops |
|---|---|
| `https://api.citymonitor.app` (the API's custom domain) | 2 |
| `https://city-monitor-api.onrender.com` | 2 |
| The static site's `/api/*` rewrite, on `citymonitor.app` and `city-monitor-web.onrender.com` (arrives with host `api.citymonitor.app`) | 3 |

One count cannot fit both lengths, so real traffic takes one path: the web app calls `https://api.citymonitor.app/api` directly (`VITE_API_BASE`, below), and the count is set for that path. A request that still comes through the rewrite is read one hop too low and lands in a proxy's shared bucket, which is harmless. Measure again after changing domains, putting another proxy or CDN in front, or moving the frontend back behind a rewrite.

### Static Frontend

- **Build:** `npm ci --include=dev && npm run build --workspace=packages/web`
- **Publish path:** `packages/web/dist`
- **API base:** `VITE_API_BASE=https://api.citymonitor.app/api`, a fixed build-time value in `render.yaml`. The browser calls the API on its own address, cross-origin: plain `GET`s with no custom headers, so no CORS preflight, and the API answers with `Access-Control-Allow-Origin` for the site's origins (`ALLOWED_ORIGINS`, below). The build also adds a `<link rel="preconnect">` to that origin (`vite.config.ts`). Unset, the base is the same-origin `/api` (local dev through the Vite proxy, CI builds).
- **SPA fallback:** `/* → /index.html` rewrite
- **API proxy:** `/api/* → https://city-monitor-api.onrender.com/api/*` rewrite. It now serves only browser tabs opened before `VITE_API_BASE` was set, whose old bundle still calls `/api`; their requests are rate-limited in a shared bucket (see above). It can be removed a while after that deploy (from 2026-10-26), once such tabs are gone. Point any outside monitor that uses `citymonitor.app/api/...` at `api.citymonitor.app` first.
- **Cache headers:** `/assets/*` immutable (1 year), everything else 5 min
- **CSP header:** Restrictive Content-Security-Policy on all paths. Allows `'self'` + `'unsafe-inline'` for scripts/styles (needed for theme-detection inline script and Tailwind/MapLibre), the site's own API (`api.citymonitor.app` in `connect-src`, and in `img-src` for the rain-radar tiles), CARTO tile domains, WMS overlay domains (gdi.berlin.de, geodienste.hamburg.de), Simple Analytics CDN, and `blob:` in `worker-src` (MapLibre v5 built its worker from a blob; v6 loads a same-origin `/assets/maplibre-gl-worker-*.js`, which `'self'` covers). Blocks frames, objects, and external fonts. Every third-party host it allows must also be named in the privacy page's third-party table (`SERVICES` in `packages/web/src/pages/PrivacyPage.tsx`); `PrivacyPage.test.tsx` fails otherwise, and checks the third-party hosts in `index.html` the same way. `citymonitor.app` and its subdomains are first party and exempt.

### Why the builds install devDependencies and call the pinned compiler

The API service sets `NODE_ENV=production`, which makes `npm ci` omit devDependencies. TypeScript, `@types/node`, Vite and drizzle-kit are all devDependencies. Without them the server build fails with `TS2688: Cannot find type definition file for 'node'`, and a bare `tsc` or `vite` falls through to whatever global binary the build machine has on its PATH. That is how chosenpath's deploy broke on 2026-09-24: Render's global `tsc` had become TypeScript 7 (fixed in chosenpath commit `100c457`). Three things keep that from happening here:

- `render.yaml` installs with `npm ci --include=dev`.
- A dashboard build command can drift from `render.yaml`, so every workspace `build` script (`shared`, `packages/server`, `packages/web`) also starts with `scripts/ensure-dev-deps.mjs`. If any direct devDependency of the root or a workspace is missing, it runs `npm install --include=dev --no-save` at the repo root, which installs the lockfile's versions and leaves the lockfile alone. If none is missing (every local, CI and `--include=dev` build), it runs nothing. That no-op is also what lets turbo build `server` and `web` in parallel without two npm installs racing.
- The build scripts call `node …/node_modules/typescript/bin/tsc` and `…/vite/bin/vite.js`, never a bare `tsc` or `vite`, and print the compiler version first. A good Render log shows `Version 5.9.3`, plus `vite v6.4.5 building for production...` for the static site.

The start command's `db:migrate` runs drizzle-kit, so the API also needs its devDependencies at runtime. The build leaves them installed. Upgrade TypeScript or Vite through the lockfile, not the platform's PATH.

## CI Pipeline

GitHub Actions workflow in `.github/workflows/ci.yml`. Runs on push/PR to `main`:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm test`
5. `npm run build` (after typecheck passes)

The workflow declares `permissions: contents: read`. This repo is public and CI runs on fork pull requests, so these jobs already execute PR-authored code (its test files, and install scripts from its own lockfile). That is contained, not prevented — read-only token, no secrets referenced, no deployment artifact (Render builds separately from `main`). Switching to `pull_request_target` or adding secrets here is a security change.

## Dependency Advisories

`npm audit` sits at **4 moderate, deliberately**. They are one dead chain: two deprecated `@esbuild-kit` packages, `drizzle-kit`, and an old esbuild beneath them. drizzle-kit's current release still declares it, only an unreleased 1.0 preview drops it, and that tool runs `db:migrate` on every deploy. `esbuild-kit` appears in drizzle-kit's `package.json` only — no source file loads it. Revisit when drizzle-kit 1.0 ships stable.

**Never run `npm audit fix --force` here.** It "fixes" those rows by downgrading drizzle-kit several major versions and exceljs by about five years, to patch code that never executes.

The root `package.json` carries `"overrides": { "uuid": "^11.1.1" }` because `node-cron` pinned `uuid` to exactly `8.3.2` and `exceljs` trails it, so no range bump reaches the patched version. 11.1.1 is the highest 11.x and the advisory's fix floor; 14.x drops the CommonJS entry point exceljs needs. Note that adding an override alone does not re-resolve an existing lockfile entry — `npm update uuid` is what actually moves it.

### Node version and the CA trust store

Node trusts only the root list compiled into its binary, so a CA removal reaches the API only through a Node upgrade, never through `npm update`. `.nvmrc` pins an exact version (currently `22.23.4`, the first 22.x without the compromised "emSign ECC Root CA - G3" root, Oct 2026). Render's native runtime and CI (`node-version-file: .nvmrc`) both read it, so one edit moves both. `engines` carries the per-line floors (`^22.23.4 || ^24.22.1 || >=26.12.1`); npm only warns on a mismatch, so `.nvmrc` is what enforces it. The repo has no Python, no Dockerfile, no vendored CA bundle and no custom `ca:` / `NODE_EXTRA_CA_CERTS`. Check a runtime with:

```bash
node -e "const {X509Certificate}=require('crypto');console.log(require('tls').rootCertificates.filter(p=>new X509Certificate(p).subject.includes('emSign ECC Root CA - G3')).length)"   # must print 0
```

Link targets from ingested feeds pass through `safeUrl()` (`packages/web/src/lib/safe-url.ts`) before reaching an `href`, because the deployed CSP allows inline script and would not block a `javascript:` URL. Apply it to any new feed-supplied link. Map popups are raw HTML strings, so their text is escaped as well (`frontend.md` → Map).

## Environment Variables

The full list: every variable the code reads (`process.env` in `packages/server`). Locally the server's npm scripts load `packages/server/.env` if it exists.

The web app reads one, at build time only: `VITE_API_BASE`, the API's base URL (`packages/web/src/lib/api-base.ts`). `render.yaml` sets it on the static site to `https://api.citymonitor.app/api`. Unset or blank, the app calls the same-origin `/api`. A change takes a rebuild of the static site, and the API's origin also has to be in the CSP's `connect-src` and `img-src` in `render.yaml`, and the site's origin in the API's `ALLOWED_ORIGINS`.

| Variable | Required | Without it |
|---|---|---|
| `DATABASE_URL` | In production (Render injects it from the Postgres service) | The server runs cache-only: nothing persists and every job re-fetches on each start. The start command's `db:migrate` and the other `db:*` scripts fail. |
| `NODE_ENV` | In production: `production` | Any other value adds `http://localhost:5173` to CORS, turns off rate limiting and exposes `POST /api/health/trigger/:jobName`. |
| `PORT` | No | Listens on `3001`. |
| `ACTIVE_CITIES` | No | Defaults to `berlin`. Comma-separated city IDs the jobs ingest and the API serves. |
| `ALLOWED_ORIGINS` | No, for citymonitor.app | CORS allows the production site's own origins: `https://citymonitor.app`, `https://www.citymonitor.app` and `https://city-monitor-web.onrender.com` (`DEFAULT_ALLOWED_ORIGINS` in `app.ts`), plus `http://localhost:5173` outside production. The browser calls the API cross-origin (`VITE_API_BASE`), so a value set here replaces that list and must hold every origin the site is served on, comma-separated; a missing one gets no data. A fork on its own domains sets it. |
| `OPENAI_API_KEY` | No, but news needs it | New news items get no AI assessment and are dropped, so the news tile and news map markers stay empty (with a database, items classified earlier keep showing until they leave the feeds). No daily briefing, and police reports get no AI map location. |
| `OPENAI_MODEL`, `OPENAI_SUMMARY_EFFORT`, `OPENAI_FILTER_MODEL`, `OPENAI_FILTER_EFFORT`, `OPENAI_GEO_MODEL`, `OPENAI_GEO_EFFORT` | No | Code defaults in `lib/llm-client.ts` apply: `gpt-6-luna` at effort `high` (briefing), `medium` (news), `none` (police locations). `OPENAI_GEO_MODEL` falls back to `OPENAI_FILTER_MODEL`. See below and `server.md`. |
| `TOMTOM_API_KEY` | No | Traffic job skipped: no traffic incidents. |
| `WAQI_API_TOKEN` | No | Air-quality grid job skipped: no WAQI stations on the map or in the air-quality tile. The grid endpoint still fetches the city's configured Sensor.Community sensors when its cache is empty, and the tile's city-wide index (Open-Meteo, fetched by the weather job) still shows. |
| `TICKETMASTER_CONSUMER_KEY` | No | Events skip Ticketmaster; Berlin's other sources (kulturdaten.berlin, gomus) still load. |
| `FIRECRAWL_API_KEY` | No | Appointments job skipped: the Bürgeramt tile stays empty. |
| `LOCATIONIQ_TOKEN` | No | Geocoding waits for Nominatim's 1 request/second instead of falling back to LocationIQ. |
| `SYNTHETIC_DATABASE_URL` | Dev only, never set in production | `db:seed` and `dev:synthetic` use the docker-compose `db`. It must be on localhost or 127.0.0.1 ([dev-database.md](dev-database.md)). |
| `SYNTHETIC_ALLOW_DATABASE_NAME` | Dev only | `db:seed` wipes only a local database named `city_monitor_dev`. |

`render.yaml` also declares `SENTRY_DSN`, but no code reads it: there is no Sentry integration.

**LLM model and effort variables** (`OPENAI_MODEL`, `OPENAI_FILTER_MODEL`, `OPENAI_GEO_MODEL` and their `*_EFFORT` vars; see `server.md`) are left unset in production, so the code defaults in `lib/llm-client.ts` apply. A value set in the Render dashboard, on the service or in a linked Environment Group, overrides the default silently and survives every deploy. `render.yaml` cannot show it, so check the dashboard after any model change. Secret files cannot override it: `node packages/server/dist/index.js` loads no env file (only the npm scripts pass `--env-file-if-exists=.env`). `/api/health` → `ai` names the model that actually ran (keys are `model:city`).

## Domain Setup

1. Add custom domain in Render → Static Site → Settings → Custom Domain
2. Render auto-provisions TLS via Let's Encrypt
3. For subdomains: add `*.domain.com` as wildcard
4. The API has its own: `api.citymonitor.app` on the `city-monitor-api` web service, which the web app calls (`VITE_API_BASE`). A new site domain also goes into `ALLOWED_ORIGINS` (or `DEFAULT_ALLOWED_ORIGINS`); a new API domain into `VITE_API_BASE` and the CSP, and the hop count is measured again on it (above).

## Monitoring

- **Health endpoint:** `GET /api/health` — uptime, active cities, cache entry count, per-job scheduler state (last run, last failure, running) and AI token/cost tracking. It does not report database status (`packages/server/src/routes/health.ts`)
- **Render Dashboard:** CPU, memory, request count, Postgres metrics
