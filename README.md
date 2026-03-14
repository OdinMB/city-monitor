<h1 align="center">City Monitor</h1>

<p align="center">
  Real-time city dashboard, currently covering Berlin.<br>
  Inspired by <a href="https://worldmonitor.io">World Monitor</a>.
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/OdinMB/city-monitor/main/packages/web/public/screenshot.png" alt="City Monitor Berlin dashboard" width="800" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/OdinMB/city-monitor/main/packages/web/public/screenshot_traffic.png" alt="City Monitor Berlin traffic map" width="395" />
  <img src="https://raw.githubusercontent.com/OdinMB/city-monitor/main/packages/web/public/screenshot_water.png" alt="City Monitor Berlin water map" width="395" />
</p>

<p align="center">
  <a href="https://citymonitor.app"><img src="https://img.shields.io/badge/live-citymonitor.app-blue" alt="Website" /></a>
  <a href="https://github.com/OdinMB/city-monitor/actions/workflows/ci.yml"><img src="https://github.com/OdinMB/city-monitor/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-green" alt="License" /></a>
</p>

---

## What it does

City Monitor aggregates public data feeds into a single dashboard per city: weather, transit disruptions, news, events, police reports, air quality, water levels, pharmacies, traffic, construction, and more. Data is ingested on a schedule via cron jobs, stored in PostgreSQL, and served as pre-built JSON to a React SPA.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind v4, Zustand, React Query, MapLibre GL |
| Backend | Node.js, Express, node-cron, Drizzle ORM |
| Database | PostgreSQL with in-memory cache |
| AI | OpenAI GPT-5 for news summarization |
| Deployment | Render.com |

## Getting Started

```bash
npm install
npm run dev          # Starts web (port 5173) + API (port 3001) via Turborepo
```

Requires a `.env` file in `packages/server/` with at least `DATABASE_URL` pointing to a PostgreSQL instance. See [`.context/deployment.md`](.context/deployment.md) for the full list of environment variables.

## Project Structure

```
packages/
  web/          React SPA (Vite)
  server/       Express API + cron jobs
shared/         Shared TypeScript types
.context/       Architecture docs and guides
.plans/         Milestone plans
```

## Adding a City

The goal is a pure data-config layer: drop in a config file, get a dashboard. In practice that's not fully realistic — some data sources have city-specific APIs, formats, or quirks that need custom processing logic. The approach is: use as much config as possible, and add your own ingestion/parsing logic where needed.

There are three ways to use this:

- **Single-city fork** — swap Berlin's config for your own city and run your own dashboard.
- **Contribute a city** — add your city's config to this repo so it appears on [citymonitor.app](https://citymonitor.app).
- **Run your own multi-city site** — fork the repo, configure multiple cities, and deploy your own instance.

> **License note:** City Monitor is [AGPL-3.0](LICENSE). If you run a modified version as a network service, you must make your source code available to users under the same license. See [Section 13](https://www.gnu.org/licenses/agpl-3.0.html#section13) for details.

### Steps

1. **Define the shared type** — the `CityConfig` interface lives in `shared/types.ts`. You shouldn't need to change it unless your city needs a new data source type.

2. **Create a server config** — add `packages/server/src/config/cities/<city>.ts` exporting a `CityConfig`. Use `berlin.ts` or `hamburg.ts` as a template. This is where you declare RSS feeds, transit stations, weather coordinates, police feeds, water level gauges, and every other data source the cron jobs will ingest.

3. **Register the server config** — import your city in `packages/server/src/config/index.ts` and add it to the `ALL_CITIES` map.

4. **Create a web config** — add `packages/web/src/config/cities/<city>.ts`. The frontend config is minimal (coordinates, map bounds, theme accent) since the SPA reads pre-built data from the API.

5. **Register the web config** — import your city in `packages/web/src/config/index.ts`, add it to `ALL_CITIES`, and add the city ID to the `ACTIVE_CITY_IDS` set.

6. **Activate on the server** — set the `ACTIVE_CITIES` environment variable to include your city (comma-separated, e.g. `berlin,hamburg,munich`). This controls which cities the cron jobs ingest data for and which city IDs the API accepts.

7. **Add translations** — add the city name and any city-specific UI strings to all four locale files in `packages/web/src/i18n/` (`en.json`, `de.json`, `tr.json`, `ar.json`).

8. **Add to Sources page** — create a sources array for your city in `packages/web/src/pages/SourcesPage.tsx` listing all data sources with attribution links.

### How it works under the hood

- **Server:** `getActiveCities()` reads `ACTIVE_CITIES` and returns configs from `ALL_CITIES`. Every cron job iterates over active cities. The `validateCity` middleware rejects requests for unknown or inactive city IDs.
- **Frontend:** The router matches `/:cityId` and looks it up via `getCityConfig()`. If the city isn't in `ACTIVE_CITY_IDS`, the user is redirected to the home page.
- **Database:** All cities share the same `snapshots` table — rows are keyed by `(city_id, type)`. No schema changes needed.
- **Cache:** Each city gets its own namespaced cache keys (e.g. `berlin:weather`, `munich:weather`). Cache warming runs for all active cities on startup.

## Deployment

See [**Deploy on Render.com**](.context/deploy-on-render.md) for a step-by-step guide covering automated blueprint setup, manual service creation, environment variables, custom domains, and troubleshooting.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

## Support

If you find this project useful, consider [supporting it on Ko-fi](https://ko-fi.com/OdinMB).

## License

[AGPL-3.0-or-later](LICENSE) — Copyright (C) 2026 Odin Muhlenbein
