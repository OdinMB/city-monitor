# City Monitor

Real-time multi-city dashboard (Berlin, Hamburg, Köln, München; only Berlin has every source). Inspired by [World Monitor](https://worldmonitor.io).

> **Dev servers are already running.** The web app (port 5173) and API server (port 3001) are up. Do **not** start additional instances via `npm run dev` or similar.

## Stack

- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind v4 + Zustand + React Query + react-router + react-i18next
- **Backend:** Node + Express, single process with `node-cron` for scheduled data ingestion
- **Database:** PostgreSQL (Render) + Drizzle ORM (schema-as-code, no code generation)
- **Cache:** In-memory Map with TTL — hot read layer in front of Postgres
- **AI:** OpenAI via LangChain. GPT-6 Luna classifies news, places police reports and writes the daily briefing. The model and effort for each call site are set in `lib/llm-client.ts`.
- **Maps:** MapLibre GL JS with CARTO tiles (free, no API key)
- **Deployment:** Render.com (1 web service + 1 static site)
- **Monorepo:** Turborepo

## Project Structure

```
packages/
  web/          — React SPA (Vite, port 5173)
  server/       — Express API (port 3001)
shared/         — Shared TypeScript types
scripts/        — Build helpers (ensure-dev-deps.mjs, see .context/deployment.md)
.plans/         — Milestone plans (version-tracked)
.context/       — Context files for Claude Code
```

## Architecture

The server runs cron jobs that fetch external data, classify/process it, write to PostgreSQL (source of truth), and update the in-memory cache. The React SPA reads pre-built JSON via REST endpoints. API reads hit the memory cache first; on miss, query Postgres. A bootstrap endpoint (`GET /api/:city/bootstrap`) returns all city data in one response for fast initial load. On server start, the cache warms from Postgres.

**Adding or activating a city:** use the `add-city` skill (`.claude/skills/add-city/SKILL.md`). It takes a config in each package, entries in code keyed by city ID, and two switches (`ACTIVE_CITY_IDS` in the web code, `ACTIVE_CITIES` on the server).

## Context Files

- [`.context/cities.md`](.context/cities.md) — Per city: which sources it has, what was looked for and not found or ruled out, and which requests to data owners are still unanswered. Update it whenever a city gains or loses a source or a request is answered.
- [`.context/licensing.md`](.context/licensing.md) — AGPL-3.0 license rules and Section 13 footer requirements.
- [`.context/server.md`](.context/server.md) — App factory, startup sequence, 34 cron jobs, logging system, health & bootstrap endpoints, history endpoints, multi-city config, LLM reasoning-effort values, utility libraries. Appointments ingestion uses Firecrawl API to scrape service.berlin.de (Varnish WAF blocks plain HTTP).
- [`.context/data-layer.md`](.context/data-layer.md) — In-memory cache API (TTL, coalescing, negative caching), Drizzle ORM schema (6 tables: unified `snapshots` + 5 specialized), read/write patterns, cache warming, freshness-based startup checks, data retention.
- [`.context/weather.md`](.context/weather.md) — BrightSky forecast ingestion, DWD severe weather alerts and UV for German cities, Open-Meteo air quality, WMO weather codes.
- [`.context/news.md`](.context/news.md) — RSS/RDF/Atom feed ingestion (6 Berlin, 3 Hamburg, 4 Köln, 2 München feeds), the LLM classifier, the daily briefing and its importance cut-off, and cost tracking. Check its feed-status notes before adding or changing a feed: BZ Berlin, Hamburger Abendblatt and taz were removed because their terms forbid AI input, passing items on or automated access.
- [`.context/air-quality-stations.md`](.context/air-quality-stations.md) — Official state-network air quality stations for all four cities from the UBA Air Data API v4 (dl-de/by-2-0, required source line "Umweltbundesamt mit Daten der Messnetze der Länder und des Bundes"): station codes per city in `dataSources.airQuality.ubaStations`, hourly NO₂/PM10/PM2.5/O₃ and UBA's index, badges on the air-quality map layer and measured values in the air-quality tile.
- [`.context/transit.md`](.context/transit.md) — VBB transport.rest integration, summary+station deduplication (one alert lists every affected line), German keyword classification of disruption type/severity.
- [`.context/lift-outages.md`](.context/lift-outages.md) — Köln-only tile of KVB lifts and escalators out of service (open data, two GeoJSON lists; the escalator list is Latin-1 and the timestamps carry no offset). Config-driven via `dataSources.liftOutages`, kept apart from the line-based transit alerts.
- [`.context/bike-sharing.md`](.context/bike-sharing.md) — Bike-sharing map layer for all four cities: nextbike GBFS (CC0) for Berlin, KVB-Rad and MyRadl, Hamburg StadtRAD from the SensorThings API (dl-de/by-2.0), one parser per `dataSources.bikeSharing.provider`. Stations only, inside the bounding box; lazy-fetched (Berlin ~150 KB), stored at most every 30 min. Call a Bike waits for a licence confirmation.
- [`.context/electricity.md`](.context/electricity.md) — Electricity tile for all four cities: renewable share and generation mix of the city's grid control area (SMARD; Berlin and Hamburg 50Hertz, Köln Amprion, München TenneT) and Germany's CO₂ intensity and traffic-light signal (Energy-Charts, about 2 requests a minute, server only). Both CC BY 4.0 with their credit in the tile footer. No day-ahead price: SMARD asks not to reuse wholesale prices until further notice.
- [`.context/citizen-reports.md`](.context/citizen-reports.md) — Citizen issue reports map layer for Köln ("Sag's uns", dl-de/zero-2.0) and München ("Mach München besser", CC0) via Open311 GeoReport v2 (`dataSources.citizenReports`): last 14 days, markers by status and category group. No free text, address or photo is kept (München's texts carry names and phone numbers). Mark-a-Spot paging quirks; Berlin's Ordnungsamt endpoint does not answer.
- [`.context/traffic-accidents.md`](.context/traffic-accidents.md) — Injury-accident map layer for all four cities from the Unfallatlas (dl-de/by-2.0): the newest year's national CSV, downloaded monthly from open.nrw and streamed out of its ZIP, filtered by municipality key (`dataSources.trafficAccidents.ags`). Compact tuples, lazy-fetched (Berlin ~470 KB); heat map below zoom 12, circles by severity above, bicycle and pedestrian filters.
- [`.context/telraam-counts.md`](.context/telraam-counts.md) — Berlin's "Street counts (Telraam)" sub-layer of the traffic layer: yesterday's cars, bikes, pedestrians and heavy vehicles per street from citizen-run Telraam sensors (Berlin zählt Mobilität, CC BY 4.0), compared with the median of the same weekday in the four weeks before. Its own job, snapshot and route (`telraam-counts`), kept apart from official counter sources; lazy-fetched, ~20 KB.
- [`.context/events-safety.md`](.context/events-safety.md) — Events (kulturdaten.berlin, Ticketmaster, go~mus for Berlin; Stadt Köln open data for Köln), police RSS (Berlin, Hamburg, Köln; none for München) with district extraction, category classification.
- [`.context/frontend.md`](.context/frontend.md) — react-router routing (`/` is a city picker with 2+ active cities, else redirects to the one city; /:cityId), React Query bootstrap pattern, per-domain polling hooks, Zustand theme, responsive panel grid, MapLibre GL with CARTO tiles.
- [`.context/i18n.md`](.context/i18n.md) — react-i18next setup, 4 languages (DE/EN/TR/AR), translation key structure, language detection, testing setup.
- [`.context/deployment.md`](.context/deployment.md) — Render.com blueprint (render.yaml), GitHub Actions CI, the one full list of environment variables and what each gates, domain setup, monitoring, and why the builds install devDependencies and call the pinned compiler (read before touching build scripts or Render build commands).
- [`.context/geocoding.md`](.context/geocoding.md) — Nominatim-first geocoding with LocationIQ fallback, rate limiting strategy, API usage, callers.
- [`.context/water-levels.md`](.context/water-levels.md) — Water parent layer with two sub-layers: PEGELONLINE river gauges (state derivation, gauge bar UI) and bathing water quality by provider (LAGeSo CSV for Berlin, Geodienste WFS for Hamburg; quality mapping, seasonal badges). New water features must follow the sub-layer pattern (same as emergencies) and use the shared types. Also the München-only Flood Status tile (LHP public API: Isar Meldestufe and flood warnings, no levels; its CC BY 4.0 terms require the "Datenquelle"/"Stand" footer and a refresh every 10 min or faster).
- [`.context/social-atlas.md`](.context/social-atlas.md) — Social-atlas choropleth map layer for Berlin (MSS 2025 WFS), Hamburg (Sozialmonitoring XLSX, shares back-calculated from z-scores) and Köln (Statistischer Datenkatalog CSV), one parser per `dataSources.socialAtlas.provider`, indicators labelled per city, area outlines committed in `packages/server/data/`; and the BA monthly unemployment dashboard tile. The dashboard tile (all four cities) reads the Bundesagentur für Arbeit's monthly Eckwertetabelle CSV, the Land table for Berlin and Hamburg and the Kreis table for Köln and München (`dataSources.laborMarket`); the map layer uses the per-city social-atlas sources for per-area indicators.
- [`.context/wastewater.md`](.context/wastewater.md) — Wastewater viral load (Influenza A/B, RSV, SARS-CoV-2) for all four cities: RKI AMELAG plants per `dataSources.wastewater` (one nationwide download, weekly means weighted by population, below-limit samples as zero), plus LAGeSo's CSV for Berlin's flu and RSV. Trend (latest vs previous week), level, 12-week sparklines in an expandable tile.
- [`.context/population.md`](.context/population.md) — Population per small area for Berlin (half-yearly EWR XLSX, Amt für Statistik), Hamburg (yearly Stadtteil statistics, OGC API) and Köln (yearly Datenkatalog CSV), one parser per `dataSources.population.provider`. A `population` map layer with 3 choropleth sub-layers (density, elderly, foreign) and a dashboard tile with age breakdown and the change since the previous half-year or year.
- [`.context/feuerwehr.md`](.context/feuerwehr.md) — Berliner Feuerwehr monthly operations from GitHub Open Data CSV. Berlin-only expandable KPI tile showing mission counts and EMS/fire response times with month-over-month comparison.
- [`.context/pollen.md`](.context/pollen.md) — DWD Pollenflug-Gefahrenindex 3-day pollen forecast for 8 types (both cities). Pollen uses a string-based intensity scale ('0' to '3' with half-steps, '-1' for off-season) and a seasonal UI that shows off-season messages in winter.
- [`.context/noise.md`](.context/noise.md) — WMS strategic noise maps (both cities, frontend-only) and Sensor.Community DNMS live noise sensors (Berlin only). Noise has two layers: a WMS raster overlay with 4 sub-layers (total/road/rail/air) and colored circle markers for live dB readings.
- [`.context/roadworks.md`](.context/roadworks.md) — Roadworks for all four cities: `dataSources.roadworks` names a provider (VIZ Berlin, Hamburg OGC API, Köln WFS, München WFS) with one parser each in `lib/roadworks-parsers.ts`. Köln's dates are permit periods, München is filtered server-side and reduced to points.
- [`.context/council-meetings.md`](.context/council-meetings.md) — Council meetings require browser-like headers for OParl servers and DST-aware timezone handling for PARDOK XML and München's RSS titles. A 14-day meeting calendar from one adapter per source: Berlin BVV OParl 1.0 (11 districts) and Abgeordnetenhaus PARDOK XML, Hamburg's Bürgerschaft website calendar (HTML, no year on its dates; no Bezirk source), Köln's single SessionNet OParl 1.1 body (sorted by creation, so paged back to today), München's RIS RSS feeds.
- [`.context/new-data-sources.md`](.context/new-data-sources.md) — **When adding a new data source, follow the checklist in this file.** It covers all 28 integration points (server, frontend, favicons, docs, tests, migration) and includes a data freshness inventory for sources with hardcoded URLs. Also contains research on potential Berlin data sources.
- [`.context/deploy-on-render.md`](.context/deploy-on-render.md) — Step-by-step Render.com deployment guide: Blueprint (automated) and manual setup for PostgreSQL, API web service, and static frontend. Covers env vars, rewrites, headers, custom domains, multi-city, troubleshooting, and costs.
- [`.context/testing.md`](.context/testing.md) — Vitest setup for both packages, how to run tests (turbo vs direct), web jsdom environment, co-located test file conventions.
- [`.context/dev-database.md`](.context/dev-database.md) — Local Postgres with synthetic Berlin data (`npm run db:seed`) and an API mode that serves it with no cron jobs, API keys, `.env` or outbound calls (`npm run dev:synthetic`). The seed wipes without asking and refuses any database other than `city_monitor_dev` on localhost. A new data source has to be added to its generator.
- [`.context/model-eval.md`](.context/model-eval.md) — Before changing an LLM model, effort or prompt, rerun the model-eval harness (`npm run eval:models`); it is read-only against the DB and budget-capped. Covers the arms, flags, decision rules, output files and known sample limits.
- [`.context/ai-transparency.md`](.context/ai-transparency.md) — Changing an AI feature, a model, an AI label or where AI text is served? Update this EU AI Act (Art. 50) record in the same change. It holds the AI feature inventory with model ids, each duty's measure and verdict, the text-watermark decision with its 2026-11-15 re-test, and the owner's open decisions.

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
npm test               # Run all Vitest suites (web + server)

# Database (run from packages/server)
npm run db:generate    # Generate migrations from schema changes
npm run db:migrate     # Apply migrations
npm run db:push        # Push schema directly (dev only)
npm run db:studio      # Open Drizzle Studio (DB browser)

# Synthetic dev database (from the repo root, after `docker compose up -d db`)
npm run db:seed        # Migrate, wipe and seed the local DB (refuses anything but local city_monitor_dev)
npm run dev:synthetic  # API on port 3001 against it: no cron jobs, no keys, no .env
```

**Before every commit, run `npm run typecheck`, `npm run lint`, AND `npm test`.** All three must pass. Do not commit on red — CI on `main` is not a gating check, so a red push lingers until someone notices. If a test fails for a reason unrelated to your change, fix it or revert; do not push past it.

## Testing

Both packages use **Vitest**. Each has its own `vitest.config.ts` with package-specific settings. Tests must be run through `turbo` (or from the package directory) so the correct config is used.

```bash
# Run ALL tests in both packages
npx turbo run test

# Run a specific test file (use turbo filter + pass file path relative to package root)
npx turbo run test --filter=@city-monitor/web -- src/components/strips/NewsStrip.test.tsx
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
- **License:** AGPL-3.0-or-later (copyright Odin Mühlenbein and contributors — see LICENSE; inbound terms in CONTRIBUTING.md)
