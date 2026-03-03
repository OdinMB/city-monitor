# City Monitor

Real-time multi-city dashboard for Berlin and Hamburg. Live at [citymonitor.app](https://citymonitor.app).

Inspired by [World Monitor](https://worldmonitor.io).

## What it does

City Monitor aggregates public data feeds into a single dashboard per city: weather, transit disruptions, news, events, police reports, air quality, water levels, pharmacies, traffic, construction, and more. Data is ingested on a schedule via cron jobs, stored in PostgreSQL, and served as pre-built JSON to a React SPA.

## Stack

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind v4, Zustand, React Query, MapLibre GL
- **Backend:** Node.js, Express, node-cron, Drizzle ORM
- **Database:** PostgreSQL with in-memory cache
- **AI:** OpenAI GPT-5 for news summarization
- **Deployment:** Render.com

## Getting Started

```bash
npm install
npm run dev          # Starts web (port 5173) + API (port 3001) via Turborepo
```

Requires a `.env` file in `packages/server/` with at least `DATABASE_URL` pointing to a PostgreSQL instance. See [`.context/deployment.md`](.context/deployment.md) for the full list of environment variables.

## Deployment

See [**Deploy on Render.com**](.context/deploy-on-render.md) for a detailed step-by-step guide covering automated blueprint setup, manual service creation, environment variables, custom domains, and troubleshooting.

## Project Structure

```
packages/
  web/          React SPA (Vite)
  server/       Express API + cron jobs
shared/         Shared TypeScript types
.context/       Architecture docs and guides
.plans/         Milestone plans
```

## License

[AGPL-3.0-or-later](LICENSE) — Copyright (C) 2026 Odin Muhlenbein
