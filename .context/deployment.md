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

- **Build:** `npm ci && npm run build --workspace=packages/server`
- **Start:** `npm run db:migrate --workspace=packages/server && node packages/server/dist/index.js`
- **Health check:** `GET /api/health`
- **Auto-deploy:** On push to `main`
- Migrations run automatically on each deploy (in start command)

### Static Frontend

- **Build:** `npm ci && npm run build --workspace=packages/web`
- **Publish path:** `packages/web/dist`
- **SPA fallback:** `/* → /index.html` rewrite
- **API proxy:** `/api/* → https://city-monitor-api.onrender.com/api/*` rewrite
- **Cache headers:** `/assets/*` immutable (1 year), everything else 5 min
- **CSP header:** Restrictive Content-Security-Policy on all paths. Allows `'self'` + `'unsafe-inline'` for scripts/styles (needed for theme-detection inline script and Tailwind/MapLibre), CARTO tile domains, WMS overlay domains (gdi.berlin.de, geodienste.hamburg.de), Simple Analytics CDN, GitHub avatars, and `blob:` in `worker-src` (MapLibre v5 built its worker from a blob; v6 loads a same-origin `/assets/maplibre-gl-worker-*.js`, which `'self'` covers). Blocks frames, objects, and external fonts.

## CI Pipeline

GitHub Actions workflow in `.github/workflows/ci.yml`. Runs on push/PR to `main`:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm test`

The workflow declares `permissions: contents: read`. This repo is public and CI runs on fork pull requests, so these jobs already execute PR-authored code (its test files, and install scripts from its own lockfile). That is contained, not prevented — read-only token, no secrets referenced, no deployment artifact (Render builds separately from `main`). Switching to `pull_request_target` or adding secrets here is a security change.

## Dependency Advisories

`npm audit` sits at **4 moderate, deliberately**. They are one dead chain: two deprecated `@esbuild-kit` packages, `drizzle-kit`, and an old esbuild beneath them. drizzle-kit's current release still declares it, only an unreleased 1.0 preview drops it, and that tool runs `db:migrate` on every deploy. `esbuild-kit` appears in drizzle-kit's `package.json` only — no source file loads it. Revisit when drizzle-kit 1.0 ships stable.

**Never run `npm audit fix --force` here.** It "fixes" those rows by downgrading drizzle-kit several major versions and exceljs by about five years, to patch code that never executes.

The root `package.json` carries `"overrides": { "uuid": "^11.1.1" }` because `node-cron` pinned `uuid` to exactly `8.3.2` and `exceljs` trails it, so no range bump reaches the patched version. 11.1.1 is the highest 11.x and the advisory's fix floor; 14.x drops the CommonJS entry point exceljs needs. Note that adding an override alone does not re-resolve an existing lockfile entry — `npm update uuid` is what actually moves it.

Link targets from ingested feeds pass through `safeUrl()` (`packages/web/src/lib/safe-url.ts`) before reaching an `href`, because the deployed CSP allows inline script and would not block a `javascript:` URL. Apply it to any new feed-supplied link.

## Environment Variables

| Variable | Service | Required | Source |
|---|---|---|---|
| `DATABASE_URL` | API | Yes | Auto-injected from Render Postgres |
| `OPENAI_API_KEY` | API | No | Manual (enables AI summaries) |
| `SENTRY_DSN` | API + Web | No | Manual (enables error tracking) |
| `ACTIVE_CITIES` | API | Yes | Default: `berlin`. Set `berlin,hamburg` for multi-city. |
| `NODE_ENV` | API | Yes | `production` |
| `PORT` | API | Yes | `3001` |

**LLM model and effort variables** (`OPENAI_MODEL`, `OPENAI_FILTER_MODEL`, `OPENAI_GEO_MODEL` and their `*_EFFORT` vars; see `server.md`) are left unset in production, so the code defaults in `lib/llm-client.ts` apply. A value set in the Render dashboard, on the service or in a linked Environment Group, overrides the default silently and survives every deploy. `render.yaml` cannot show it, so check the dashboard after any model change. Secret files cannot override it: `node packages/server/dist/index.js` loads no env file (only the npm scripts pass `--env-file-if-exists=.env`). `/api/health` → `ai` names the model that actually ran (keys are `model:city`).

## Domain Setup

1. Add custom domain in Render → Static Site → Settings → Custom Domain
2. Render auto-provisions TLS via Let's Encrypt
3. For subdomains: add `*.domain.com` as wildcard

## Monitoring

- **Health endpoint:** `GET /api/health` — uptime, DB status, cache stats, AI cost tracking
- **Render Dashboard:** CPU, memory, request count, Postgres metrics
- **Sentry (optional):** Error tracking, performance monitoring
