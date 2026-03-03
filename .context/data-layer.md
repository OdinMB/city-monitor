# Data Layer: Database & Cache

## Architecture

Postgres is the source of truth. An in-memory Map is the hot read layer in front of it. API reads hit the cache first; on miss, query Postgres; on miss, return empty defaults. Cron jobs write to both cache and DB.

## In-Memory Cache (`packages/server/src/lib/cache.ts`)

Factory: `createCache()` returns a `Cache` object. Adapted from worldmonitor's Redis cache — replaced Redis with a plain `Map<string, CacheEntry>`.

### API

| Method | Description |
|---|---|
| `get<T>(key)` | Synchronous. Returns null if expired or missing. |
| `set(key, data, ttlSeconds)` | Stores with absolute expiry timestamp. |
| `delete(key)` | Removes entry. |
| `fetch<T>(key, ttl, fetcher, negTtl?)` | Async lazy-load with in-flight coalescing. Concurrent calls for the same key share a single promise. Failed fetches are negative-cached for `negTtl` seconds (default 120s) to avoid thundering herd. |
| `getBatch(keys)` | Returns `Record<key, value>` for all non-null entries. Used by bootstrap endpoint. |
| `size()` | Entry count (for health endpoint). |
| `clear()` | Empties store and in-flight map. Used in tests. |

### Cache Keys & TTLs

| Key pattern | TTL | Writer |
|---|---|---|
| `{cityId}:weather` | 1800s (30 min) | ingest-weather |
| `{cityId}:transit:alerts` | 300s (5 min) | ingest-transit |
| `{cityId}:events:upcoming` | 21600s (6h) | ingest-events |
| `{cityId}:safety:recent` | 900s (15 min) | ingest-safety |
| `{cityId}:news:digest` | 900s (15 min) | ingest-feeds |
| `{cityId}:news:{category}` | 900s (15 min) | ingest-feeds |
| `{cityId}:news:summary` | 86400s (24h) | summarize |
| `{cityId}:air-quality:grid` | 1800s (30 min) | ingest-aq-grid |
| `{cityId}:political:{level}` | 604800s (7 days) | ingest-political |
| `feed:{hash}` | 600s (10 min) | ingest-feeds (raw feed XML) |

## Database (`packages/server/src/db/`)

### Setup (`index.ts`)

ORM: Drizzle (schema-as-code, no code generation). Driver: `postgres` (node-postgres). Connection from `DATABASE_URL` env var. Returns `null` if not set — server runs in cache-only mode.

### Schema (`schema.ts`)

9 tables with indices for query performance:

| Table | Key Columns | Index |
|---|---|---|
| `weatherSnapshots` | cityId, current/hourly/daily (JSONB), alerts (JSONB) | `weather_city_idx(cityId)` |
| `transitDisruptions` | cityId, line, type, severity, message, affectedStops (JSONB), resolved | `transit_city_idx(cityId)` |
| `events` | cityId, title, venue, date, category, url, free, hash | `events_city_date_idx(cityId, date)` |
| `safetyReports` | cityId, title, description, publishedAt, url, district, hash | `safety_city_published_idx(cityId, publishedAt)` |
| `newsItems` | cityId, hash, title, url, publishedAt, category, tier, relevant, confidence, lat/lon | `news_city_idx(cityId)` |
| `airQualityGrid` | cityId, lat, lon, europeanAqi, station, url | `aq_grid_city_idx(cityId)` |
| `geocodeLookups` | query, lat, lon, displayName, provider | `geocode_query_idx(query)` (unique) |
| `politicalDistricts` | cityId, level, districts (JSONB) | `political_city_level_idx(cityId, level)` (unique) |
| `aiSummaries` | cityId, headlineHash, summary, model, inputTokens, outputTokens | `summaries_city_generated_idx(cityId, generatedAt)` |

All tables have `id` (serial PK), `cityId` (text), and `fetchedAt` (timestamp, default now).

### Reads (`reads.ts`)

Query functions that return typed objects or `null`. Each loads the most recent data for a city:
- `loadWeather(db, cityId)` — latest snapshot, maps JSONB to `WeatherData`
- `loadTransitAlerts(db, cityId)` — all rows, maps to `TransitAlert[]`
- `loadEvents(db, cityId)` — sorted by date ascending, maps to `CityEvent[]`
- `loadSafetyReports(db, cityId)` — sorted by publishedAt descending
- `loadNewsItems(db, cityId)` — sorted by publishedAt descending, includes LLM assessment
- `loadSummary(db, cityId)` — latest by generatedAt, includes headlineHash
- `loadAirQualityGrid(db, cityId)` — all rows, maps to `AirQualityGridPoint[]`
- `loadPoliticalDistricts(db, cityId, level)` — JSONB blob, maps to `PoliticalDistrict[]`

### Writes (`writes.ts`)

All use transactions with delete-then-insert (full refresh per city, not upsert):
- `saveWeather(db, cityId, data)`
- `saveTransitAlerts(db, cityId, alerts)`
- `saveEvents(db, cityId, events)`
- `saveSafetyReports(db, cityId, reports)`
- `saveNewsItems(db, cityId, items)` — persists items with LLM assessments and geo data
- `saveSummary(db, cityId, summary, model, tokens)`
- `saveAirQualityGrid(db, cityId, points)`
- `savePoliticalDistricts(db, cityId, level, districts)` — upsert on (cityId, level)

### Cache Warming (`warm-cache.ts`)

Runs on server start if DB is connected. Loads all data types (weather, transit, events, safety, news items, summaries, NINA warnings, air quality grid, political districts, geocode lookups) for all active cities from Postgres into cache with their standard TTLs. News items are loaded, filtered via `applyDropLogic`, and written to both digest and per-category cache keys. Errors are logged but don't block startup — each domain is independent.

### Data Retention (`cron/data-retention.ts`)

Nightly cron (3am) prunes old data to keep DB size manageable:

| Table | Retention |
|---|---|
| `weatherSnapshots` | 30 days |
| `transitDisruptions` (resolved) | 48 hours |
| `safetyReports` | 7 days |
| `newsItems` | 7 days |
| `airQualityGrid` | 48 hours |
| `politicalDistricts` | 30 days |
| `aiSummaries` | 30 days |

## Patterns

- **Cache-first reads:** Route handlers check cache, then DB, then return empty defaults. No writes to cache on DB-fallback reads (cache is populated by cron).
- **Dual writes:** Cron jobs write to cache immediately, then attempt DB write (errors caught, logged, non-fatal).
- **Full refresh:** DB writes delete all rows for a city then insert fresh data in a transaction. Simple and correct for small per-city datasets.
- **Optional DB:** Everything works without `DATABASE_URL` — cache-only mode with no persistence across restarts.
- **City isolation:** All cache keys and DB queries are prefixed/filtered by `cityId`. No cross-city data leaks.
