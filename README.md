<p align="center">
  <img src="https://raw.githubusercontent.com/OdinMB/city-monitor/main/packages/web/public/og-default.png" alt="City Monitor — Real-time city dashboard" width="600" />
</p>

<h1 align="center">City Monitor</h1>

<p align="center">
  Real-time city dashboard, currently covering Berlin.<br>
  Inspired by <a href="https://worldmonitor.io">World Monitor</a>.
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

## Deployment

See [**Deploy on Render.com**](.context/deploy-on-render.md) for a step-by-step guide covering automated blueprint setup, manual service creation, environment variables, custom domains, and troubleshooting.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

## Support

If you find this project useful, consider [supporting it on Ko-fi](https://ko-fi.com/OdinMB).

## License

[AGPL-3.0-or-later](LICENSE) — Copyright (C) 2026 Odin Muhlenbein
