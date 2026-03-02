# Server Architecture

## App Factory (`packages/server/src/app.ts`)

`createApp(options?)` builds the Express app. Accepts `{ skipScheduler?: boolean }` for tests.

### Startup Sequence

1. Create Express app with CORS + JSON middleware
2. Create in-memory cache (always)
3. Create DB connection if `DATABASE_URL` set (returns `null` otherwise)
4. Warm cache from Postgres if DB connected
5. Create ingestion functions (feed, weather, transit, events, safety, summarize) — each receives cache and optionally db
6. Create scheduler with 6 cron jobs (all `runOnStart: true`)
7. Mount routers under `/api`: health, news, weather, transit, events, safety
8. Return `{ app, cache, db, scheduler }`

Entry point (`index.ts`) calls `createApp()` and listens on `PORT` (default 3001).

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
| `ingest-safety` | `*/10 * * * *` | Berlin police RSS |

All jobs have `runOnStart: true`. Startup jobs run sequentially in definition order so later jobs can depend on data from earlier ones (e.g. summarize needs feeds).

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
  "activeCities": ["berlin"],
  "cache": { "entries": 42 },
  "scheduler": { "jobs": [{ "name": "...", "lastRun": "..." }] },
  "ai": { "berlin": { "input": 5000, "output": 250, "calls": 5, "estimatedCostUsd": 0.0049 } }
}
```

## Bootstrap Endpoint

`GET /api/:city/bootstrap` (in `routes/news.ts`) returns all 5 data types in one response for fast initial page load: news digest, weather, transit alerts, events, safety reports. Uses `cache.getBatch()`.

## City Configuration (`packages/server/src/config/`)

- `index.ts` — `getActiveCities()` reads `ACTIVE_CITIES` env var (comma-separated IDs, default "berlin"), returns matching `CityConfig[]`. `getCityConfig(id)` for single lookup.
- `cities/berlin.ts` — Berlin config with coordinates, bounding box, timezone, languages, map settings, theme accent color, 10 RSS feeds, and data source URLs (weather lat/lon, transit provider, events API, police RSS).

Adding a city = adding a config file + adding to `ALL_CITIES` dict + setting `ACTIVE_CITIES` env var.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | Server listen port |
| `DATABASE_URL` | No | — | Postgres connection string. Cache-only mode if not set. |
| `OPENAI_API_KEY` | No | — | Enables AI summarization. Skipped if not set. |
| `OPENAI_MODEL` | No | `gpt-5-mini` | OpenAI model for summaries |
| `ACTIVE_CITIES` | No | `berlin` | Comma-separated city IDs |

## Utility Libraries

| File | Purpose |
|---|---|
| `lib/hash.ts` | FNV-1a 52-bit hash → base-36 string. Used for dedup keys everywhere. |
| `lib/rate-gate.ts` | Serializes concurrent calls with minimum gap. Factory: `createRateGate(minGapMs)`. |
| `lib/rss-parser.ts` | RSS 2.0 + Atom parser using `fast-xml-parser`. Returns `FeedItem[]`. |
| `lib/classifier.ts` | German keyword-based headline classification into 8 categories. |
