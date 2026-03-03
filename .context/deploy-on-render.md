# Deploy City Monitor on Render.com — Step by Step

This guide walks you through deploying City Monitor from scratch on [Render.com](https://render.com). You will create three services: a PostgreSQL database, a Node.js API server, and a static frontend site.

## Prerequisites

- A [Render account](https://dashboard.render.com/register) (free tier works for the static site; database and API need the Starter plan at $7/mo each)
- The repository pushed to GitHub (public or connected to Render via GitHub app)
- (Optional) An [OpenAI API key](https://platform.openai.com/api-keys) for AI news summaries
- (Optional) A [Firecrawl API key](https://firecrawl.dev) for Berlin appointment scraping
- (Optional) A [LocationIQ token](https://locationiq.com) for geocoding fallback
- (Optional) A [Sentry DSN](https://sentry.io) for error tracking

## Overview

| # | Service | Type | Plan | Region |
|---|---------|------|------|--------|
| 1 | `city-monitor-db` | PostgreSQL | Starter ($7/mo) | Frankfurt |
| 2 | `city-monitor-api` | Web Service (Node) | Starter ($7/mo) | Frankfurt |
| 3 | `city-monitor-web` | Static Site | Free | Global CDN |

Create them in this order — the API server needs the database connection string, and the static site proxies API requests to the API server.

---

## Option A: Blueprint (Automated)

The repo includes a `render.yaml` blueprint that creates all three services automatically.

1. Go to **[Render Dashboard](https://dashboard.render.com)** → **Blueprints** → **New Blueprint Instance**
2. Connect your GitHub repo (`OdinMB/city-monitor` or your fork)
3. Pick the branch: **`main`**
4. Render reads `render.yaml` and shows the three services. Review them.
5. Fill in the prompted environment variables:
   - `OPENAI_API_KEY` — paste your key, or leave blank to skip AI summaries
   - `SENTRY_DSN` — paste your DSN, or leave blank
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
| **Build Command** | `npm ci && npm run build --workspace=packages/server` |
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
| `OPENAI_API_KEY` | *(your key)* | Optional — enables AI news summaries |
| `FIRECRAWL_API_KEY` | *(your key)* | Optional — enables Berlin appointment scraping |
| `LOCATIONIQ_TOKEN` | *(your token)* | Optional — geocoding fallback |
| `SENTRY_DSN` | *(your DSN)* | Optional — error tracking |

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
| **Build Command** | `npm ci && npm run build --workspace=packages/web` |
| **Publish Directory** | `packages/web/dist` |

4. Add **Redirect/Rewrite Rules** (under the "Redirects/Rewrites" tab):

| Type | Source | Destination |
|------|--------|-------------|
| **Rewrite** | `/api/*` | `https://city-monitor-api.onrender.com/api/*` |
| **Rewrite** | `/*` | `/index.html` |

> **Order matters.** The `/api/*` rewrite must come **before** the `/*` catch-all SPA fallback.

> **Important:** Replace `city-monitor-api` in the destination URL with your actual API service name if you chose a different name.

5. Add **Headers** (under the "Headers" tab):

| Path | Header Name | Value |
|------|-------------|-------|
| `/assets/*` | `Cache-Control` | `public, max-age=31536000, immutable` |
| `/*` | `Cache-Control` | `public, max-age=300` |

6. Click **Create Static Site**
7. Wait for the build (~2–3 min)

---

## Post-Deploy Verification

1. **Health check:** Visit `https://city-monitor-api.onrender.com/api/health` — you should see JSON with `"status": "ok"`, database connection status, and cache stats
2. **Frontend:** Visit `https://city-monitor-web.onrender.com` — the dashboard should load and show data within a few minutes (cron jobs need time to populate)
3. **API proxy:** Visit `https://city-monitor-web.onrender.com/api/health` — this should proxy to the API and return the same health JSON

## Custom Domain (Optional)

### Frontend domain

1. Go to **Static Site** → **Settings** → **Custom Domains**
2. Click **Add Custom Domain**, enter your domain (e.g. `citymonitor.app`)
3. Add the DNS records Render shows you at your registrar:
   - **Apex domain** (`citymonitor.app`): A record → Render's IP
   - **Subdomain** (`www.citymonitor.app`): CNAME → `city-monitor-web.onrender.com`
4. Render auto-provisions a TLS certificate via Let's Encrypt

### API subdomain (optional)

If you want the API on its own subdomain (e.g. `api.citymonitor.app`) instead of proxying through the static site's `/api/*` rewrite:

1. Go to **Web Service** (`city-monitor-api`) → **Settings** → **Custom Domains**
2. Click **Add Custom Domain**, enter `api.citymonitor.app`
3. Add a DNS record at your registrar: CNAME `api` → `city-monitor-api.onrender.com`
4. Wait for the TLS certificate to provision (automatic)
5. Update the **Static Site** rewrite rule to use the new subdomain:
   - Go to **Static Site** → **Redirects/Rewrites**
   - Change the `/api/*` rewrite destination from `https://city-monitor-api.onrender.com/api/*` to `https://api.citymonitor.app/api/*`

No frontend code changes are needed — the SPA uses relative `/api` paths, so all API calls go through the static site's rewrite rule regardless of which domain the rewrite points to.

## Adding Hamburg (Multi-City)

To enable Hamburg alongside Berlin:

1. Go to **API Web Service** → **Environment**
2. Change `ACTIVE_CITIES` from `berlin` to `berlin,hamburg`
3. Save — Render auto-redeploys. Hamburg data starts populating via cron jobs.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API returns 503 or health check fails | Check Render logs for the API service. Common cause: `DATABASE_URL` not set or database not ready yet |
| Frontend loads but shows no data | Wait 5–10 min for cron jobs to run. Check `/api/health` to confirm the API is up |
| API rewrite not working on static site | Verify the `/api/*` rewrite rule is listed **before** the `/*` rule |
| `OPENAI_API_KEY` errors in logs | Key is optional — remove it or set a valid key. Summaries degrade to headline-only mode without it |
| Deploy fails at build step | Check that `npm ci` succeeds — Render needs the `package-lock.json` committed |
| Migrations fail on start | Check `DATABASE_URL` points to a running Postgres instance. Verify the database user has schema permissions |
| Render free tier spins down | Free-tier web services spin down after 15 min of inactivity. Use Starter plan for always-on. Static sites are always available |

## Cost Summary

| Service | Monthly Cost |
|---------|-------------|
| PostgreSQL (Starter) | $7 |
| API Web Service (Starter) | $7 |
| Static Site (Free) | $0 |
| **Total** | **$14/month** |
