# City Monitor

Real-time city dashboard, starting with Berlin. Extracts proven patterns from the [worldmonitor](https://github.com/ellie-xyb/worldmonitor) repo into a focused, single-city product.

## Stack

- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind v4 + Zustand + React Query
- **Backend:** Node + Express, single process with `node-cron` for scheduled data ingestion
- **Database:** PostgreSQL (Render) + Drizzle ORM (schema-as-code, no code generation)
- **Cache:** In-memory Map with TTL — hot read layer in front of Postgres
- **AI:** OpenAI GPT-5 for news summarization
- **Maps:** MapLibre GL JS with CARTO tiles (free, no API key)
- **Deployment:** Render.com (1 web service + 1 static site)
- **Monorepo:** Turborepo

## Project Structure

```
packages/
  web/          — React SPA (Vite, port 5173)
  server/       — Express API (port 3001)
shared/         — Shared TypeScript types
.worldmonitor/  — Reference copy of worldmonitor (gitignored, delete after all milestones)
.plans/         — Milestone plans (version-tracked)
.context/       — Context files for Claude Code
```

## Architecture

The server runs cron jobs that fetch external data, classify/process it, write to PostgreSQL (source of truth), and update the in-memory cache. The React SPA reads pre-built JSON via REST endpoints. API reads hit the memory cache first; on miss, query Postgres. A bootstrap endpoint (`GET /api/:city/bootstrap`) returns all city data in one response for fast initial load. On server start, the cache warms from Postgres.

Adding a city = adding a config file + setting `ACTIVE_CITIES` env var.

## Milestone Plans

Plans live in `.plans/` and are version-tracked. MVP = milestones 01-05 (scaffolding → news UI). The `.worldmonitor/` directory is the reference for porting patterns — each plan references specific files in it.

## Context Files

- [`.context/licensing.md`](.context/licensing.md) — AGPL-3.0 per-file header templates, adapted component list, and Section 13 footer requirements.
- [`.context/server.md`](.context/server.md) — App factory, startup sequence, scheduler/cron jobs, logging system, health & bootstrap endpoints, city config, env vars, utility libraries.
- [`.context/data-layer.md`](.context/data-layer.md) — In-memory cache API (TTL, coalescing, negative caching), Drizzle ORM schema (5 tables), read/write patterns, cache warming.
- [`.context/weather.md`](.context/weather.md) — Open-Meteo forecast ingestion, DWD severe weather alerts for German cities, WMO weather codes.
- [`.context/news.md`](.context/news.md) — RSS feed ingestion (10 Berlin feeds, 3 tiers), headline classifier, AI summarization via OpenAI (gpt-5-mini), cost tracking.
- [`.context/transit.md`](.context/transit.md) — VBB transport.rest integration, line+summary deduplication, German keyword classification of disruption type/severity.
- [`.context/events-safety.md`](.context/events-safety.md) — kulturdaten.berlin events API, berlin.de police RSS with district extraction, category classification.
- [`.context/frontend.md`](.context/frontend.md) — React Query bootstrap pattern, per-domain polling hooks, Zustand theme, responsive panel grid, MapLibre GL with CARTO tiles.

## Key Conventions

- **Postgres + memory cache** — Postgres is the source of truth; in-memory Map is the hot read layer
- **No SSR** — Vite SPA; dashboard content is client-rendered
- **No WebSocket/SSE** — React Query polling; cron-driven data doesn't change fast enough
- **No auth** — public dashboards with public data
- **package.json** in every package must have `"license": "AGPL-3.0-or-later"`

## Dev Commands

```bash
npm run dev            # Start both web and server via Turborepo
npm run build          # Production build
npm run typecheck      # Type-check all packages
npm run lint           # Lint all packages

# Database (run from packages/server)
npm run db:generate    # Generate migrations from schema changes
npm run db:migrate     # Apply migrations
npm run db:push        # Push schema directly (dev only)
npm run db:studio      # Open Drizzle Studio (DB browser)
```

## Repository

- **Remote:** https://github.com/OdinMB/city-monitor
- **Main branch:** main
- **License:** AGPL-3.0-or-later (dual copyright — see LICENSE)
