# Server Architecture

## App Factory (`packages/server/src/app.ts`)

`createApp(options?)` builds the Express app. Accepts `{ skipScheduler?: boolean }` for tests.

### Startup Sequence

1. Create Express app with CORS + JSON middleware
2. Create in-memory cache (always)
3. Create DB connection if `DATABASE_URL` set (returns `null` otherwise)
4. Warm cache from Postgres if DB connected
5. Create ingestion functions (feed, weather, transit, events, safety, summarize, nina, air-quality, pharmacies, traffic, political) — each receives cache and optionally db
6. Create scheduler with 12 cron jobs (all `runOnStart: true` except data-retention and political)
7. Mount routers under `/api` with per-route Cache-Control headers
8. Return `{ app, cache, db, scheduler }`

Entry point (`index.ts`) calls `createApp()` and listens on `PORT` (default 3001).

### Cache-Control Headers

Applied via middleware per route tier:

| Route | max-age | Rationale |
|---|---|---|
| `/api/:city/news/*` | 300s (5 min) | Feeds update every 10 min |
| `/api/:city/weather` | 300s (5 min) | Weather updates every 30 min |
| `/api/:city/transit` | 120s (2 min) | Transit updates every 5 min |
| `/api/:city/events` | 1800s (30 min) | Events update every 6h |
| `/api/:city/safety` | 300s (5 min) | Safety updates every 10 min |
| `/api/:city/warnings` | 300s (5 min) | NINA alerts update every 10 min |
| `/api/:city/air-quality` | 600s (10 min) | Air quality updates every 30 min |
| `/api/:city/pharmacies` | 3600s (1h) | Pharmacies update every 6h |
| `/api/:city/traffic` | 120s (2 min) | Traffic updates every 5 min |
| `/api/:city/political/:level` | 86400s (24h) | Political data updates weekly |

## Scheduler (`packages/server/src/lib/scheduler.ts`)

Wrapper around `node-cron` with job metadata tracking.

### Jobs (defined in app.ts)

| Job | Schedule | Description |
|---|---|---|
| `ingest-feeds` | `*/10 * * * *` | Fetch RSS feeds, classify, cache digest |
| `summarize-news` | `5,20,35,50 * * * *` | AI summary of top headlines |
| `ingest-weather` | `*/30 * * * *` | Open-Meteo + DWD alerts |
| `ingest-transit` | `*/5 * * * *` | VBB departure disruptions |
| `ingest-events` | `0 */6 * * *` | kulturdaten.berlin events |
| `ingest-safety` | `*/10 * * * *` | Police RSS |
| `ingest-nina` | `*/10 * * * *` | NINA civil protection warnings |
| `ingest-air-quality` | `*/30 * * * *` | Open-Meteo air quality index |
| `ingest-pharmacies` | `0 */6 * * *` | aponet.de emergency pharmacies |
| `ingest-traffic` | `*/5 * * * *` | TomTom traffic incidents |
| `ingest-political` | `0 4 * * 1` | abgeordnetenwatch.de representatives (weekly) |
| `data-retention` | `0 3 * * *` | Prune old data (nightly) |

All ingestion jobs have `runOnStart: true` except data-retention (3am only) and political (weekly Monday 4am).

### API

- `getJobs(): JobInfo[]` — name, schedule, lastRun (for health endpoint)
- `stop(): void` — stops all cron tasks (for graceful shutdown)

## Logging (`packages/server/src/lib/logger.ts`)

Factory: `createLogger(tag)` returns `{ info, warn, error, fetch }`.

- **Format:** `2026-03-02T14:30:05Z [tag] message` (no milliseconds)
- `info` → `console.log`, `warn` → `console.warn` with `WARN:` prefix, `error` → `console.error` with `ERROR:` prefix (optional error object on next line)
- `fetch(url, init?)` — wraps `globalThis.fetch`, logs `FETCH {url} -> {status} ({ms}ms)`. Non-ok responses logged at warn level, network errors at error level (re-thrown). URLs truncated at 80 chars.

Every server source file uses the logger — no raw `console.*` calls outside `logger.ts` itself.

## Health Endpoint (`packages/server/src/routes/health.ts`)

`GET /api/health` returns:
```json
{
  "status": "ok",
  "uptime": 12345.67,
  "activeCities": ["berlin", "hamburg"],
  "cache": { "entries": 42 },
  "scheduler": { "jobs": [{ "name": "...", "lastRun": "..." }] },
  "ai": { "berlin": { "input": 5000, "output": 250, "calls": 5, "estimatedCostUsd": 0.0049 } }
}
```

## Bootstrap Endpoint

`GET /api/:city/bootstrap` (in `routes/news.ts`) returns all data types in one response for fast initial page load: news digest, weather, transit alerts, events, safety reports, NINA warnings, air quality, pharmacies, traffic. Uses `cache.getBatch()`.

## City Configuration (`packages/server/src/config/`)

- `index.ts` — `getActiveCities()` reads `ACTIVE_CITIES` env var (comma-separated IDs, default "berlin"), returns matching `CityConfig[]`. `getCityConfig(id)` for single lookup.
- `cities/berlin.ts` — Berlin config with 10 RSS feeds, weather (Open-Meteo), transit (VBB), events (kulturdaten.berlin), police (berlin.de RSS).
- `cities/hamburg.ts` — Hamburg config with 4 RSS feeds (NDR, Abendblatt, MOPO, hamburg.de), weather (Open-Meteo), transit (HVV via HAFAS), police (presseportal.de RSS).

Adding a city = adding a config file + registering in `ALL_CITIES` + setting `ACTIVE_CITIES` env var.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | Server listen port |
| `DATABASE_URL` | No | — | Postgres connection string. Cache-only mode if not set. |
| `OPENAI_API_KEY` | No | — | Enables AI summarization. Skipped if not set. |
| `OPENAI_MODEL` | No | `gpt-5-mini` | OpenAI model for summaries |
| `OPENAI_FILTER_MODEL` | No | `gpt-5-nano` | Model for news filtering + location extraction |
| `ACTIVE_CITIES` | No | `berlin` | Comma-separated city IDs |
| `APONET_TOKEN` | No | _(community token)_ | aponet.de API token for emergency pharmacies |
| `TOMTOM_API_KEY` | No | — | TomTom traffic API key. Traffic skipped if not set. |

## Utility Libraries

| File | Purpose |
|---|---|
| `lib/hash.ts` | FNV-1a 52-bit hash → base-36 string. Used for dedup keys everywhere. |
| `lib/rate-gate.ts` | Serializes concurrent calls with minimum gap. Factory: `createRateGate(minGapMs)`. |
| `lib/rss-parser.ts` | RSS 2.0 + Atom parser using `fast-xml-parser`. Returns `FeedItem[]`. |
| `lib/classifier.ts` | German keyword-based headline classification into 8 categories. |
| `lib/nominatim.ts` | OSM Nominatim geocoding with 1 req/sec rate limiting. Used by LLM pipelines. |
