# City Monitor

Real-time multi-city dashboard (Berlin, Hamburg). Inspired by [World Monitor](https://worldmonitor.io).

> **Dev servers are already running.** The web app (port 5173) and API server (port 3001) are up. Do **not** start additional instances via `npm run dev` or similar.

## Stack

- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind v4 + Zustand + React Query + react-router + react-i18next
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
.plans/         — Milestone plans (version-tracked)
.context/       — Context files for Claude Code
```

## Architecture

The server runs cron jobs that fetch external data, classify/process it, write to PostgreSQL (source of truth), and update the in-memory cache. The React SPA reads pre-built JSON via REST endpoints. API reads hit the memory cache first; on miss, query Postgres. A bootstrap endpoint (`GET /api/:city/bootstrap`) returns all city data in one response for fast initial load. On server start, the cache warms from Postgres.

Adding a city = adding a config file (server + web) + registering in `ALL_CITIES` + setting `ACTIVE_CITIES` env var.

## Context Files

- [`.context/licensing.md`](.context/licensing.md) — AGPL-3.0 license rules and Section 13 footer requirements.
- [`.context/server.md`](.context/server.md) — App factory, startup sequence, 22 cron jobs, logging system, health & bootstrap endpoints, history endpoints, multi-city config, env vars, utility libraries. Appointments ingestion uses Firecrawl API to scrape service.berlin.de (Varnish WAF blocks plain HTTP).
- [`.context/data-layer.md`](.context/data-layer.md) — In-memory cache API (TTL, coalescing, negative caching), Drizzle ORM schema (21 tables with indices), read/write patterns, cache warming, freshness-based startup checks, data retention.
- [`.context/weather.md`](.context/weather.md) — Open-Meteo forecast ingestion, DWD severe weather alerts for German cities, WMO weather codes.
- [`.context/news.md`](.context/news.md) — RSS feed ingestion (10 Berlin + 4 Hamburg feeds), headline classifier, AI summarization via OpenAI (gpt-5-mini), cost tracking.
- [`.context/transit.md`](.context/transit.md) — VBB transport.rest integration, line+summary deduplication, German keyword classification of disruption type/severity.
- [`.context/events-safety.md`](.context/events-safety.md) — kulturdaten.berlin events API, police RSS (Berlin + Hamburg) with district extraction, category classification.
- [`.context/frontend.md`](.context/frontend.md) — react-router routing (city picker + /:cityId), React Query bootstrap pattern, per-domain polling hooks, Zustand theme, responsive panel grid, MapLibre GL with CARTO tiles.
- [`.context/i18n.md`](.context/i18n.md) — react-i18next setup, 4 languages (DE/EN/TR/AR), translation key structure, language detection, testing setup.
- [`.context/deployment.md`](.context/deployment.md) — Render.com blueprint (render.yaml), GitHub Actions CI, environment variables, domain setup, monitoring.
- [`.context/geocoding.md`](.context/geocoding.md) — Nominatim-first geocoding with LocationIQ fallback, rate limiting strategy, API usage, callers.
- [`.context/water-levels.md`](.context/water-levels.md) — Water parent layer with two sub-layers: PEGELONLINE river gauges (state derivation, gauge bar UI) and LAGeSo bathing water quality (CSV ingestion, quality mapping, seasonal badges). New water features must follow the sub-layer pattern (same as emergencies) and use the shared types.
- [`.context/social-atlas.md`](.context/social-atlas.md) — MSS 2023 WFS choropleth map layer (biennial, lazy GeoJSON) and BA monthly unemployment dashboard tile. The dashboard tile uses the Bundesagentur fur Arbeit Statistics API (monthly CSV) for current unemployment rates; the map layer uses the separate MSS WFS for per-area social indicators.
- [`.context/wastewater.md`](.context/wastewater.md) — Lageso Berlin wastewater viral load monitoring (Influenza A/B, RSV) from CSV open data. Wastewater data uses weekly CSV ingestion, trend computation (latest vs previous week), and a Berlin-only expandable dashboard tile (collapsed: level badges, expanded: sparkline charts with values).
- [`.context/population.md`](.context/population.md) — Semi-annual EWR population demographics from Amt für Statistik (XLSX, SheetJS). Population adds 3 choropleth map sub-layers (density, elderly, foreign) under the socioeconomic parent and a Berlin-only expandable dashboard tile with age breakdown.
- [`.context/feuerwehr.md`](.context/feuerwehr.md) — Berliner Feuerwehr monthly operations from GitHub Open Data CSV. Berlin-only expandable KPI tile showing mission counts and EMS/fire response times with month-over-month comparison.
- [`.context/pollen.md`](.context/pollen.md) — DWD Pollenflug-Gefahrenindex 3-day pollen forecast for 8 types (both cities). Pollen uses a string-based intensity scale ('0' to '3' with half-steps, '-1' for off-season) and a seasonal UI that shows off-season messages in winter.
- [`.context/new-data-sources.md`](.context/new-data-sources.md) — **When adding a new data source, follow the checklist in this file.** It covers all 27 integration points (server, frontend, favicons, docs, tests, migration) and includes a data freshness inventory for sources with hardcoded URLs. Also contains research on potential Berlin data sources.
- [`.context/deploy-on-render.md`](.context/deploy-on-render.md) — Step-by-step Render.com deployment guide: Blueprint (automated) and manual setup for PostgreSQL, API web service, and static frontend. Covers env vars, rewrites, headers, custom domains, multi-city, troubleshooting, and costs.
- [`.context/testing.md`](.context/testing.md) — Vitest setup for both packages, how to run tests (turbo vs direct), web jsdom environment, co-located test file conventions.

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

## Testing

Both packages use **Vitest**. Each has its own `vitest.config.ts` with package-specific settings. Tests must be run through `turbo` (or from the package directory) so the correct config is used.

```bash
# Run ALL tests in both packages
npx turbo run test

# Run a specific test file (use turbo filter + pass file path relative to package root)
npx turbo run test --filter=@city-monitor/web -- src/components/TrendChart.test.tsx
npx turbo run test --filter=@city-monitor/server -- src/lib/parse-history.test.ts

# Run tests with verbose output
npx turbo run test --filter=@city-monitor/web -- --reporter=verbose
```

**Important:** Do NOT run `npx vitest run <path>` from the monorepo root — it picks the wrong config. Always use `turbo run test --filter=<package>` or run from within the package directory.

- **Web** (`packages/web`): jsdom environment, `@testing-library/react`, setup file at `src/test-setup.ts`
- **Server** (`packages/server`): Node environment, no DOM

## Repository

- **Remote:** https://github.com/OdinMB/city-monitor
- **URL:** https://citymonitor.app
- **Main branch:** main
- **License:** AGPL-3.0-or-later (dual copyright — see LICENSE)
