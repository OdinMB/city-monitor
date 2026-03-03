# Server Architecture

## App Factory (`packages/server/src/app.ts`)

`createApp(options?)` builds the Express app. Accepts `{ skipScheduler?: boolean }` for tests.

### Startup Sequence

1. Create Express app with CORS + JSON middleware
2. Create in-memory cache (always)
3. Create DB connection if `DATABASE_URL` set (returns `null` otherwise)
4. Warm cache from Postgres if DB connected — reads run **in parallel** across cities and within each city via `Promise.allSettled`
5. Run freshness check (`findStaleJobs`) — queries `fetched_at` from each domain's table. Domains with data newer than their cron interval are considered fresh; stale or missing domains are flagged for startup ingestion
6. Create ingestion functions — each receives cache and optionally db
7. Create scheduler with cron jobs. Only stale domains get `runOnStart: true`; fresh domains skip startup API calls. Without a DB, all domains are marked stale (preserves cache-only behavior). Startup runs execute **in parallel**, respecting `dependsOn` ordering (e.g. `summarize-news` waits for `ingest-feeds`)
8. Mount routers under `/api` with per-route Cache-Control headers
9. Return `{ app, cache, db, scheduler }`

Entry point (`index.ts`) calls `createApp()` and listens on `PORT` (default 3001).

### Cache-Control Headers

Applied via middleware per route tier:

| Route | max-age | Rationale |
|---|---|---|
| `/api/:city/news/*` | 300s (5 min) | Feeds update every 10 min |
| `/api/:city/weather` | 300s (5 min) | Weather updates every 30 min |
| `/api/:city/transit` | 120s (2 min) | Transit updates every 15 min |
| `/api/:city/events` | 1800s (30 min) | Events update every 6h |
| `/api/:city/safety` | 300s (5 min) | Safety updates every 10 min |
| `/api/:city/warnings` | 300s (5 min) | NINA alerts update every 10 min |
| `/api/:city/air-quality` | 600s (10 min) | Air quality updates every 30 min |
| `/api/:city/pharmacies` | 3600s (1h) | Pharmacies update every 6h |
| `/api/:city/traffic` | 120s (2 min) | Traffic updates every 5 min |
| `/api/:city/construction` | 900s (15 min) | Construction updates every 30 min |
| `/api/:city/water-levels` | 300s (5 min) | Water levels update every 15 min |
| `/api/:city/aeds` | 43200s (12h) | AEDs update daily |
| `/api/:city/social-atlas` | 43200s (12h) | Social atlas updates weekly |
| `/api/:city/budget` | 3600s (1h) | Budget updates daily |
| `/api/:city/appointments` | 3600s (1h) | Appointments update every 6h |
| `/api/:city/bathing` | 43200s (12h) | Bathing quality updates daily |
| `/api/:city/wastewater` | 43200s (12h) | Wastewater updates daily |
| `/api/:city/labor-market` | 3600s (1h) | Labor market updates daily |
| `/api/:city/political/:level` | 3600s (1h) | Political data updates weekly |
| `/api/:city/weather/history` | 1800s (30 min) | Historical temperature (7d) |
| `/api/:city/air-quality/history` | 1800s (30 min) | Historical AQI (30d) |
| `/api/:city/water-levels/history` | 1800s (30 min) | Historical water levels (30d) |
| `/api/:city/labor-market/history` | 1800s (30 min) | Historical unemployment (24mo) |

## Scheduler (`packages/server/src/lib/scheduler.ts`)

Wrapper around `node-cron` with job metadata tracking. Supports `dependsOn?: string[]` for startup ordering — jobs with unmet dependencies wait; all others run in parallel.

### Jobs (defined in app.ts)

| Job | Schedule | Description |
|---|---|---|
| `ingest-feeds` | `*/10 * * * *` | Fetch RSS feeds, classify, cache digest |
| `summarize-news` | `5,20,35,50 * * * *` | AI summary of top headlines |
| `ingest-weather` | `*/30 * * * *` | Open-Meteo + DWD alerts |
| `ingest-transit` | `*/15 * * * *` | VBB departure disruptions |
| `ingest-events` | `0 */6 * * *` | kulturdaten.berlin events |
| `ingest-safety` | `*/10 * * * *` | Police RSS |
| `ingest-nina` | `*/5 * * * *` | NINA civil protection warnings |
| `ingest-air-quality` | `*/30 * * * *` | WAQI stations + Sensor.Community (PM→EAQI) grid |
| `ingest-pharmacies` | `0 */6 * * *` | aponet.de emergency pharmacies |
| `ingest-traffic` | `*/5 * * * *` | TomTom traffic incidents |
| `ingest-construction` | `*/30 * * * *` | VIZ Berlin construction/roadworks |
| `ingest-water-levels` | `*/15 * * * *` | PEGELONLINE river gauge stations |
| `ingest-appointments` | `0 */6 * * *` | Firecrawl-scraped Bürgeramt appointment availability |
| `ingest-aeds` | `0 0 * * *` | OpenStreetMap AED locations (daily) |
| `ingest-social-atlas` | `0 5 * * 0` | MSS WFS social atlas GeoJSON (weekly) |
| `ingest-budget` | `0 6 * * *` | Berlin Haushalt budget data (daily) |
| `ingest-bathing` | `0 6 * * *` | LAGeSo bathing water quality (daily) |
| `ingest-wastewater` | `0 6 * * *` | LAGeSo wastewater viral loads (daily, Berlin-only) |
| `ingest-labor-market` | `0 7 * * *` | BA unemployment statistics (daily, Berlin-only) |
| `ingest-political` | `0 4 * * 1` | abgeordnetenwatch.de representatives (weekly) |
| `data-retention` | `0 3 * * *` | Prune old data (nightly) |

Ingestion jobs use conditional `runOnStart` based on DB freshness checks — only stale/missing domains trigger startup API calls. `data-retention` never runs on start. `summarize-news` has `dependsOn: ['ingest-feeds']`.

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

`GET /api/:city/bootstrap` (in `routes/news.ts`) returns all data types in one response for fast initial page load: news digest, weather, transit alerts, events, safety reports, NINA warnings, air quality, pharmacies, traffic, construction, water levels, appointments. Uses `cache.getBatch()`.

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
| `LOCATIONIQ_TOKEN` | No | — | LocationIQ geocoding token. Used as fallback when Nominatim is rate-limited. |
| `WAQI_API_TOKEN` | No | — | WAQI air quality API token. AQ grid skipped if not set. |
| `TOMTOM_API_KEY` | No | — | TomTom traffic API key. Traffic skipped if not set. |
| `OPENWEATHERMAP_API_KEY` | No | — | OWM tile proxy for weather map overlay. Returns 503 if not set. |
| `FIRECRAWL_API_KEY` | No | — | Firecrawl v2 API key for Bürgeramt appointment scraping. Appointments skipped if not set. |

## Utility Libraries

| File | Purpose |
|---|---|
| `lib/hash.ts` | FNV-1a 52-bit hash → base-36 string. Used for dedup keys everywhere. |
| `lib/rate-gate.ts` | Serializes concurrent calls with minimum gap. Factory: `createRateGate(minGapMs)`. |
| `lib/rss-parser.ts` | RSS 2.0 + Atom parser using `fast-xml-parser`. Returns `FeedItem[]`. |
| `lib/classifier.ts` | German keyword-based headline classification into 8 categories. |
| `lib/geocode.ts` | Nominatim-first geocoding (1 QPS, free). Falls back to LocationIQ when rate-limited and `LOCATIONIQ_TOKEN` is set. |
| `lib/parse-history.ts` | Parses `?history=Nd` query params. Used by history endpoints. |
