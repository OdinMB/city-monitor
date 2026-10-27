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
| AI | OpenAI: GPT-6 Luna for news classification, police-report locations and the daily briefing |
| Deployment | Render.com |

## Getting Started

```bash
npm install
npm run dev          # Starts web (port 5173) + API (port 3001) via Turborepo
```

No variable is required to start. Without `DATABASE_URL` the server runs cache-only: data lives in memory, every job re-fetches on each start, and nothing survives a restart. To persist data, set `DATABASE_URL` to a PostgreSQL connection string in `packages/server/.env` and run `npm run db:migrate` from `packages/server/`. Without `OPENAI_API_KEY` the news tile stays empty. See [`.context/deployment.md`](.context/deployment.md#environment-variables) for the full list of environment variables and what each one gates.

### With synthetic data

You don't need API keys, a `.env` file or access to a real database to run a local copy with data in every tile and map layer. Docker runs a local Postgres, and the app serves made-up Berlin data from it:

```bash
docker compose up -d db                 # local Postgres on port 5434
npm run db:seed                         # migrate it and fill it with synthetic data
npm run dev:synthetic                   # API on port 3001: no cron jobs, no outbound requests
npm run dev --workspace=packages/web    # in a second terminal: web on port 5173
```

`db:seed` wipes the docker database without asking, and it refuses any database other than `city_monitor_dev` on localhost. The data is dated when you seed it, so seed again when tiles go empty. If the seed fails with "relation already exists", the volume was set up with `db:push`: run `docker compose down -v` to delete it, then start over. See [`.context/dev-database.md`](.context/dev-database.md).

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

The [`add-city` skill](.claude/skills/add-city/SKILL.md) holds the same work in order for Claude Code, and reads as plain Markdown too. It adds how to look up each Germany-wide source for a city, a list of the code keyed by city ID, and the licence check for city-specific sources.

1. **Define the shared type** — the `CityConfig` interface lives in `shared/types.ts`. You shouldn't need to change it unless your city needs a new data source type.

2. **Create a server config** — add `packages/server/src/config/cities/<city>.ts` exporting a `CityConfig`. Use `koeln.ts` as a template for a city with the Germany-wide sources only (weather, DWD warnings, UV and pollen, NINA, river gauges), or `berlin.ts` for one with its own feeds and sources. This is where you declare RSS feeds, transit stations, weather coordinates, police feeds, water level gauges, and every other data source the cron jobs will ingest.

3. **Register the server config** — import your city in `packages/server/src/config/index.ts` and add it to the `ALL_CITIES` map.

4. **Create a web config** — add `packages/web/src/config/cities/<city>.ts`. The frontend config is minimal (coordinates, map bounds) since the SPA reads pre-built data from the API; its name, place, time zone and languages must match the server config (`packages/web/src/config/index.test.ts` checks). The map opens on `map.bounds` and cannot pan past them.

5. **Register the web config** — import your city in `packages/web/src/config/index.ts`, add it to `ALL_CITIES`, and add the city ID to the `ACTIVE_CITY_IDS` set when it should go live. Until then `/<city>` redirects to Berlin; on a running deployment, set `ACTIVE_CITIES` (step 6) first.

6. **Activate on the server** — set the `ACTIVE_CITIES` environment variable to include your city (comma-separated, e.g. `berlin,hamburg,munich`). This controls which cities the cron jobs ingest data for and which city IDs the API accepts.

7. **Add translations** — the city's name on screen is the config's `name`, in every language, so it needs no translation. Add any city-specific UI strings to all four locale files in `packages/web/src/i18n/` (`en.json`, `de.json`, `tr.json`, `ar.json`). Use the German name (`Köln`, not `Cologne`): the DWD warnings and UV forecast are matched by it.

8. **Add to Sources page** — create a sources array for your city in `packages/web/src/pages/SourcesPage.tsx` listing all data sources with attribution links.

9. **Check the code keyed to Berlin** — some features test for the ID `berlin` in code instead of reading the city config. A new city gets none of them until you add its own branch and data, and a fork that drops Berlin loses them. `git grep -nw berlin -- 'packages/*/src/*' 'packages/web/vite*' ':!*.test.*'` lists every place. The ones you will hit:
   - **Dashboard tiles** — Wastewater Viral Load, Fire Department, Unemployment, Population, Crisis Services and Council Meetings render only for Berlin (`CommandLayout.tsx`). The wastewater, bathing, labor-market, population and Feuerwehr jobs fetch Berlin's data under the fixed ID `berlin`, and only while `berlin` is in `ACTIVE_CITIES` (`BERLIN_ONLY_JOBS` in `app.ts`); `db/warm-cache.ts` restores those (plus noise sensors and council meetings) only for Berlin. The bathing tile shows for every city but stays empty outside Berlin.
   - **Map layers** — the social atlas, rent map and population layers, the total-noise map and the live noise sensors are Berlin-only (`CityMap.tsx`, `DataLayerToggles.tsx`). District outlines for the political layer and the noise WMS layers are keyed by city ID in `components/map/constants.ts`.
   - **Server lookups** — the pharmacy search postcode (`CITY_PLZ` in `ingest-pharmacies.ts`: no entry, no pharmacies), the parliaments (`PARLIAMENT_CONFIG` in `ingest-political.ts`: no entry, no political data) and the hard-coded district mayors (`BEZIRKSBUERGERMEISTER`, same file). The Bürgeramt scraper and booking link only know service.berlin.de (`ingest-appointments.ts`, `routes/appointments.ts`, `AppointmentsStrip.tsx`). The AED search and the state parliament assume a city-state: the Overpass query looks for an `admin_level=4` area named like the city (`ingest-aeds.ts`), and the state parliament's members all count as the city's (`ingest-political.ts`), so for a city inside a state the AED layer stays empty, and a `PARLIAMENT_CONFIG` entry would show the whole state parliament as the city's. The WAQI credit names each city's monitoring agencies (`WAQI_AGENCIES` in `packages/web/src/lib/aqi.ts`); WAQI's terms require it.
   - **Build, links and styling** — per-city page meta and the sitemap list `/berlin` and `/hamburg` under the base URL `https://citymonitor.app` (`vite.config.ts`, `DASHBOARD_ROUTES` in `vite-plugin-seo.ts`, OG images in `public/og-<city>.png`). The privacy page links to `/berlin/sources`. The dashboard accent colour comes from a `[data-city='<city>']` block in `globals.css`.

10. *(Optional)* **Add a city skyline** — add an SVG skyline function in `packages/web/src/components/layout/SkylineSeparator.tsx` and wire it to your city ID. This renders a silhouette separator between the hero map and the dashboard tiles. If omitted, a generic skyline is used. You can also delete the skyline entirely if you prefer a clean edge.

### How it works under the hood

- **Server:** `getActiveCities()` reads `ACTIVE_CITIES` and returns configs from `ALL_CITIES`. Cron jobs iterate over active cities, except the Berlin-only ones in step 9. The `validateCity` middleware rejects requests for unknown or inactive city IDs.
- **Frontend:** The router matches `/:cityId` and looks it up via `getCityConfig()`. If the city isn't in `ACTIVE_CITY_IDS`, the user is redirected to the home page, which redirects to Berlin while it is active and otherwise to the first active city (`getDefaultCityId()`).
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
