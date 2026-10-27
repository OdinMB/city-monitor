# Deploy City Monitor on Render.com — Step by Step

This guide walks you through deploying City Monitor from scratch on [Render.com](https://render.com). You will create three services: a PostgreSQL database, a Node.js API server, and a static frontend site.

## Prerequisites

- A [Render account](https://dashboard.render.com/register) (free tier works for the static site; database and API need the Starter plan at $7/mo each)
- The repository pushed to GitHub (public or connected to Render via GitHub app)
- (Optional) An [OpenAI API key](https://platform.openai.com/api-keys) for news classification and the AI briefing — without it the news tile stays empty
- (Optional) A [Firecrawl API key](https://firecrawl.dev) for Berlin appointment scraping
- (Optional) A [LocationIQ token](https://locationiq.com) for geocoding fallback

## Overview

| # | Service | Type | Plan | Region |
|---|---------|------|------|--------|
| 1 | `city-monitor-db` | PostgreSQL | Starter ($7/mo) | Frankfurt |
| 2 | `city-monitor-api` | Web Service (Node) | Starter ($7/mo) | Frankfurt |
| 3 | `city-monitor-web` | Static Site | Free | Global CDN |

Create them in this order — the API server needs the database connection string, and the static site's build needs the API server's address. Visitors' browsers call the API on its own address (cross-origin, allowed by CORS), not through the static site.

---

## Option A: Blueprint (Automated)

The repo includes a `render.yaml` blueprint that creates all three services automatically.

**On a fork, first edit `render.yaml` in your repo.** It points the site at citymonitor.app's API, which refuses other sites' origins, so without these changes your dashboard loads no data:

- Static site `envVars`: set `VITE_API_BASE` to your API's address plus `/api`, e.g. `https://<your-api-service>.onrender.com/api` or `https://api.<your-domain>/api`.
- Static site CSP header: replace `https://api.citymonitor.app` in `connect-src` and `img-src` with your API's origin.
- API service `envVars`: add `ALLOWED_ORIGINS` with every origin your site is served on, comma-separated, e.g. `https://<your-site>.onrender.com,https://<your-domain>` (unset, it allows only citymonitor.app's origins).
- The `/api/*` rewrite's destination: your API's address. With `VITE_API_BASE` set the site no longer uses it, so you can also delete it.

1. Go to **[Render Dashboard](https://dashboard.render.com)** → **Blueprints** → **New Blueprint Instance**
2. Connect your GitHub repo (`OdinMB/city-monitor` or your fork)
3. Pick the branch: **`main`**
4. Render reads `render.yaml` and shows the three services. Review them.
5. Fill in the prompted environment variables:
   - `OPENAI_API_KEY` — paste your key, or leave blank (the news tile then stays empty and there is no briefing)
   - `SENTRY_DSN` — leave blank: `render.yaml` declares it, but no code reads it
6. Click **Apply**
7. Wait for the database to spin up first (~2 min), then the API and static site will build

After the blueprint deploys, skip to [Post-Deploy Verification](#post-deploy-verification). If you need more control or the blueprint doesn't suit you, use Option B.

---

## Option B: Manual Setup

### Step 1 — Create the PostgreSQL Database

1. Go to **[Render Dashboard](https://dashboard.render.com)** → **New** → **PostgreSQL**
2. Fill in the fields:

| Field | Value |
|-------|-------|
| **Name** | `city-monitor-db` |
| **Database** | `city_monitor` |
| **User** | `city_monitor` |
| **Region** | Frankfurt (EU Central) |
| **PostgreSQL Version** | 16 (default) |
| **Plan** | Starter ($7/month) |

3. Click **Create Database**
4. Wait for it to become available (~1–2 min)
5. Go to the database page → **Info** tab → copy the **Internal Database URL** (starts with `postgres://`). You'll use this in the next step.

### Step 2 — Create the API Server (Web Service)

1. **Dashboard** → **New** → **Web Service**
2. Connect your GitHub repo and select the `main` branch
3. Fill in the fields:

| Field | Value |
|-------|-------|
| **Name** | `city-monitor-api` |
| **Region** | Frankfurt (EU Central) |
| **Branch** | `main` |
| **Root Directory** | *(leave blank)* |
| **Runtime** | Node |
| **Build Command** | `npm ci --include=dev && npm run build --workspace=shared && npm run build --workspace=packages/server` |
| **Start Command** | `npm run db:migrate --workspace=packages/server && node packages/server/dist/index.js` |
| **Plan** | Starter ($7/month) |

4. Expand **Advanced** and set **Health Check Path** to `/api/health`

5. Add **Environment Variables** (click "Add Environment Variable" for each):

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Required |
| `PORT` | `3001` | Required |
| `ACTIVE_CITIES` | `berlin` | Required. Use `berlin,hamburg` for multi-city |
| `DATABASE_URL` | *(paste the Internal Database URL from Step 1)* | Required. Or use "Connect a Database" button to auto-inject |
| `ALLOWED_ORIGINS` | `https://city-monitor-web.onrender.com` | Required unless you serve the site on citymonitor.app. Every origin your static site is served on, comma-separated (add your custom domain later). The browser calls the API cross-origin, and CORS refuses any other origin |
| `OPENAI_API_KEY` | *(your key)* | Optional, but news needs it — without it the news tile stays empty and there is no briefing |
| `FIRECRAWL_API_KEY` | *(your key)* | Optional — enables Berlin appointment scraping |
| `LOCATIONIQ_TOKEN` | *(your token)* | Optional — geocoding fallback |

The other optional keys (TomTom traffic, WAQI air quality, Ticketmaster events) and what each one gates are listed in [deployment.md](deployment.md#environment-variables).

> **Tip:** Instead of pasting `DATABASE_URL` manually, scroll down to "Connect a Database", select `city-monitor-db`, and Render injects the connection string automatically.

6. Click **Create Web Service**
7. Wait for the first deploy to finish (~3–5 min). The start command runs migrations automatically.

### Step 3 — Create the Static Frontend

1. **Dashboard** → **New** → **Static Site**
2. Connect the same GitHub repo, branch `main`
3. Fill in the fields:

| Field | Value |
|-------|-------|
| **Name** | `city-monitor-web` |
| **Branch** | `main` |
| **Root Directory** | *(leave blank)* |
| **Build Command** | `npm ci --include=dev && npm run build --workspace=packages/web` |
| **Publish Directory** | `packages/web/dist` |

4. Add an **Environment Variable**, read at build time:

| Key | Value | Notes |
|-----|-------|-------|
| `VITE_API_BASE` | `https://city-monitor-api.onrender.com/api` | Your API's address plus `/api`. Replace `city-monitor-api` with your API service name, or use the API's custom domain once it has one. Changing it takes a rebuild |

5. Add a **Redirect/Rewrite Rule** (under the "Redirects/Rewrites" tab):

| Type | Source | Destination |
|------|--------|-------------|
| **Rewrite** | `/*` | `/index.html` |

> A `/api/* → https://<your-api>.onrender.com/api/*` rewrite before it is needed only if you leave `VITE_API_BASE` unset: the app then calls `/api` on the site's own origin. It costs the API one more proxy hop, which the rate limits' hop count (2, see [deployment.md](deployment.md#client-address-and-trust-proxy)) does not fit, so visitors would share a proxy's rate-limit bucket.

6. Add **Headers** (under the "Headers" tab):

| Path | Header Name | Value |
|------|-------------|-------|
| `/assets/*` | `Cache-Control` | `public, max-age=31536000, immutable` |
| `/*` | `Cache-Control` | `public, max-age=300` |

7. Click **Create Static Site**
8. Wait for the build (~2–3 min)

---

## Post-Deploy Verification

1. **Health check:** Visit `https://city-monitor-api.onrender.com/api/health` — you should see JSON with `"status": "ok"`, the active cities, the cache entry count and the scheduler's jobs (it does not report database status; check the logs for `warm-cache` lines to confirm the DB connection)
2. **Frontend:** Visit `https://city-monitor-web.onrender.com` — the dashboard should load and show data within a few minutes (cron jobs need time to populate)
3. **API calls:** In the browser's developer tools (Network tab), the dashboard's data requests go to the API's address from `VITE_API_BASE` and succeed. A CORS error in the console means the site's origin is missing from the API's `ALLOWED_ORIGINS`; a Content-Security-Policy error means the API's origin is missing from the CSP's `connect-src`

## Custom Domain (Optional)

### Frontend domain

1. Go to **Static Site** → **Settings** → **Custom Domains**
2. Click **Add Custom Domain**, enter your domain (e.g. `citymonitor.app`)
3. Add the DNS records Render shows you at your registrar:
   - **Apex domain** (`citymonitor.app`): A record → Render's IP
   - **Subdomain** (`www.citymonitor.app`): CNAME → `city-monitor-web.onrender.com`
4. Render auto-provisions a TLS certificate via Let's Encrypt
5. Make sure the API allows the new origin, or the dashboard on that domain loads no data: the code default covers `citymonitor.app`, `www.citymonitor.app` and `city-monitor-web.onrender.com`; any other domain goes into the API's `ALLOWED_ORIGINS`, together with every other origin the site is served on

### API subdomain (optional)

To serve the API on its own subdomain (e.g. `api.citymonitor.app`, as citymonitor.app does):

1. Go to **Web Service** (`city-monitor-api`) → **Settings** → **Custom Domains**
2. Click **Add Custom Domain**, enter `api.citymonitor.app`
3. Add a DNS record at your registrar: CNAME `api` → `city-monitor-api.onrender.com`
4. Wait for the TLS certificate to provision (automatic)
5. On the **Static Site**, set `VITE_API_BASE` to `https://api.citymonitor.app/api` and put `https://api.citymonitor.app` in the CSP's `connect-src` and `img-src` (in `render.yaml` with the blueprint), then rebuild the static site
6. Check the rate limits' hop count on the new domain ([deployment.md](deployment.md#client-address-and-trust-proxy)): it was 2 on `api.citymonitor.app`, the same as on `onrender.com`, but a proxy or CDN of your own in front of the domain adds hops

## Adding a City (Multi-City)

To enable a configured city such as Hamburg (`hamburg`) or Köln (`koeln`) alongside Berlin, switch the API on first, so the city's page never opens on an API that refuses it:

1. Go to **API Web Service** → **Environment**
2. Change `ACTIVE_CITIES` from `berlin` to e.g. `berlin,hamburg`
3. Save — Render auto-redeploys. The city's data starts populating on that start: a job runs at startup when any active city it serves has no fresh data, Berlin's fresh rows notwithstanding, so the city's tiles fill then rather than at each job's next scheduled run (`ingest-appointments` alone keeps the table-wide check; [server.md](server.md))
4. In the code, add the city ID to `ACTIVE_CITY_IDS` in `packages/web/src/config/index.ts` and push: the web build hardcodes its active cities, so without this the static site keeps redirecting the city's page to Berlin. Hamburg already has its routes, pre-rendering and share image; Köln does not yet, so its push also adds `/koeln` and `/koeln/sources` to `vite.config.ts` and `DASHBOARD_ROUTES` and an OG image (the `add-city` skill, "Activate")

A city that is not configured yet needs its config files first: the `add-city` skill (`.claude/skills/add-city/SKILL.md`) or the README's "Adding a City".

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API returns 503 or health check fails | Check Render logs for the API service. Common cause: `DATABASE_URL` not set or database not ready yet |
| Frontend loads but shows no data | Wait 5–10 min for cron jobs to run. Check `/api/health` to confirm the API is up |
| Dashboard loads but every tile fails, CORS error in the browser console | The site's origin is missing from the API's `ALLOWED_ORIGINS` (exact scheme and host, no trailing slash) |
| Dashboard loads but every tile fails, Content-Security-Policy error in the console | The API's origin from `VITE_API_BASE` is missing from the CSP's `connect-src` |
| Requests still go to `/api` on the site | `VITE_API_BASE` was not set when the static site was built: set it and rebuild |
| `OPENAI_API_KEY` errors in logs | Key is optional — remove it or set a valid key. Without it news items are not classified and all dropped, so the news tile stays empty |
| Deploy fails at build step | Check that `npm ci` succeeds — Render needs the `package-lock.json` committed. The build log should show `Version 5.9.3`, the repo's pinned TypeScript; see [deployment.md](deployment.md) for why the builds install devDependencies |
| Migrations fail on start | Check `DATABASE_URL` points to a running Postgres instance. Verify the database user has schema permissions |
| Render free tier spins down | Free-tier web services spin down after 15 min of inactivity. Use Starter plan for always-on. Static sites are always available |

## Cost Summary

| Service | Monthly Cost |
|---------|-------------|
| PostgreSQL (Starter) | $7 |
| API Web Service (Starter) | $7 |
| Static Site (Free) | $0 |
| **Total** | **$14/month** |
