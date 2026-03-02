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

## CI Pipeline

GitHub Actions workflow in `.github/workflows/ci.yml`. Runs on push/PR to `main`:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm test`

## Environment Variables

| Variable | Service | Required | Source |
|---|---|---|---|
| `DATABASE_URL` | API | Yes | Auto-injected from Render Postgres |
| `OPENAI_API_KEY` | API | No | Manual (enables AI summaries) |
| `SENTRY_DSN` | API + Web | No | Manual (enables error tracking) |
| `ACTIVE_CITIES` | API | Yes | Default: `berlin`. Set `berlin,hamburg` for multi-city. |
| `NODE_ENV` | API | Yes | `production` |
| `PORT` | API | Yes | `3001` |

## Domain Setup

1. Add custom domain in Render → Static Site → Settings → Custom Domain
2. Render auto-provisions TLS via Let's Encrypt
3. For subdomains: add `*.domain.com` as wildcard

## Monitoring

- **Health endpoint:** `GET /api/health` — uptime, DB status, cache stats, AI cost tracking
- **Render Dashboard:** CPU, memory, request count, Postgres metrics
- **Sentry (optional):** Error tracking, performance monitoring
