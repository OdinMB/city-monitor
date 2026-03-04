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
| `{cityId}:construction:sites` | 1800s (30 min) | ingest-construction |
| `{cityId}:water-levels` | 900s (15 min) | ingest-water-levels |
| `{cityId}:political:{level}` | 604800s (7 days) | ingest-political |
| `{cityId}:budget` | 86400s (24h) | ingest-budget |
| `{cityId}:traffic:incidents` | 300s (5 min) | ingest-traffic |
| `{cityId}:pharmacies:emergency` | 21600s (6h) | ingest-pharmacies |
| `{cityId}:aed:locations` | 86400s (24h) | ingest-aeds |
| `{cityId}:social-atlas:geojson` | 604800s (7 days) | ingest-social-atlas |
| `{cityId}:wastewater:summary` | 604800s (7 days) | ingest-wastewater (Berlin-only) |
| `{cityId}:bathing:spots` | 86400s (24h) | ingest-bathing (Berlin-only) |
| `{cityId}:labor-market` | 86400s (24h) | ingest-labor-market (Berlin-only) |
| `{cityId}:appointments` | 21600s (6h) | ingest-appointments |
| `{cityId}:nina:warnings` | 600s (10 min) | ingest-nina |
| `{cityId}:weather:history:{N}d` | 1800s (30 min) | history endpoint (lazy) |
| `{cityId}:aqi:history:{N}d` | 1800s (30 min) | history endpoint (lazy) |
| `{cityId}:water-levels:history:{N}d` | 1800s (30 min) | history endpoint (lazy) |
| `{cityId}:labor-market:history:{N}d` | 1800s (30 min) | history endpoint (lazy) |
| `feed:{hash}` | 600s (10 min) | ingest-feeds (raw feed XML) |

## Database (`packages/server/src/db/`)

### Setup (`index.ts`)

ORM: Drizzle (schema-as-code, no code generation). Driver: `postgres` (node-postgres). Connection from `DATABASE_URL` env var. Returns `null` if not set — server runs in cache-only mode.

### Schema (`schema.ts`)

All data domains now have DB persistence. Tables use three write patterns:
- **Snapshot tables** (weather, water levels, budget, etc.): INSERT-only, read latest via `ORDER BY fetchedAt DESC LIMIT 1`.
- **Multi-row current-state tables** (transit, air quality): INSERT-only batches, read latest batch via `MAX(fetchedAt)` with staleness guard.
- **Hash-keyed tables** (news, events, safety, NINA): UPSERT on unique keys, avoiding duplicates while preserving history.

Historical data accumulates and is cleaned by the data-retention cron.

| Table | Key Columns | Index |
|---|---|---|
| `weatherSnapshots` | cityId, current/hourly/daily (JSONB), alerts (JSONB) | `weather_city_idx(cityId)` |
| `transitDisruptions` | cityId, line, type, severity, message, affectedStops (JSONB), resolved | `transit_city_idx(cityId)` |
| `events` | cityId, title, venue, date, category, url, free, hash | `events_city_date_idx(cityId, date)` |
| `safetyReports` | cityId, title, description, publishedAt, url, district, hash | `safety_city_published_idx(cityId, publishedAt)` |
| `newsItems` | cityId, hash, title, url, publishedAt, category, tier, relevantToCity, importance, lat/lon | `news_city_idx(cityId)`, unique `news_city_hash_idx(cityId, hash)` |
| `airQualityGrid` | cityId, lat, lon, europeanAqi, station, url | `aq_grid_city_idx(cityId)` |
| `geocodeLookups` | query, lat, lon, displayName, provider | `geocode_query_idx(query)` (unique) |
| `waterLevelSnapshots` | cityId, stations (JSONB) | `water_level_city_idx(cityId)` |
| `politicalDistricts` | cityId, level, districts (JSONB) | `political_city_level_idx(cityId, level)` (unique) |
| `appointmentSnapshots` | cityId, services (JSONB), bookingUrl | `appointment_city_idx(cityId)` |
| `budgetSnapshots` | cityId, data (JSONB) | `budget_city_idx(cityId)` |
| `constructionSnapshots` | cityId, sites (JSONB) | `construction_city_idx(cityId)` |
| `trafficSnapshots` | cityId, incidents (JSONB) | `traffic_city_idx(cityId)` |
| `pharmacySnapshots` | cityId, pharmacies (JSONB) | `pharmacy_city_idx(cityId)` |
| `aedSnapshots` | cityId, locations (JSONB) | `aed_city_idx(cityId)` |
| `socialAtlasSnapshots` | cityId, geojson (JSONB) | `social_atlas_city_idx(cityId)` |
| `wastewaterSnapshots` | cityId, data (JSONB) | `wastewater_city_idx(cityId)` |
| `bathingSnapshots` | cityId, spots (JSONB) | `bathing_city_idx(cityId)` |
| `laborMarketSnapshots` | cityId, data (JSONB) | `labor_market_city_idx(cityId)` |
| `aiSummaries` | cityId, headlineHash, summary, model, inputTokens, outputTokens | `summaries_city_generated_idx(cityId, generatedAt)` |

All tables have `id` (serial PK), `cityId` (text), and `fetchedAt` (timestamp, default now).

### Reads (`reads.ts`)

All route-facing read functions return `DbResult<T>` (`{ data: T; fetchedAt: Date } | null`). This wrapper ensures routes always have the real `fetchedAt` timestamp from the DB — never `new Date()`. Each function loads the most recent data for a city. Snapshot tables use `ORDER BY fetchedAt DESC LIMIT 1`. Multi-row tables (transit, air quality, NINA) use `MAX(fetchedAt)` to find the latest batch. Safety-net upper bounds (3–48h depending on domain) prevent serving extremely stale data when a cron job has stopped entirely, but generous enough to always surface data while the cron is running.
- `loadWeather`, `loadTransitAlerts`, `loadEvents`, `loadSafetyReports`, `loadNewsItems`, `loadSummary`, `loadNinaWarnings`, `loadAirQualityGrid`, `loadWaterLevels`, `loadPoliticalDistricts`, `loadAppointments`
- `loadBudget`, `loadConstructionSites`, `loadTrafficIncidents`, `loadPharmacies`, `loadAeds`, `loadSocialAtlas`, `loadWastewater`, `loadBathingSpots`, `loadLaborMarket`, `loadPopulationGeojson`, `loadPopulationSummary`, `loadFeuerwehr`
- **Historical queries** (used by `/history` endpoints, not cron): `loadWeatherHistory`, `loadAqiHistory`, `loadWaterLevelHistory`, `loadLaborMarketHistory` — each takes `(db, cityId, sinceDays)` and returns `HistoryPoint[]`

### Writes (`writes.ts`)

Three write patterns (no transactions, no deletes — retention cron handles cleanup):
- **Snapshot tables** (12 tables): Plain INSERT of one row per city per ingestion.
- **Multi-row tables** (transit, air quality): Plain INSERT of batch rows. Guard for empty arrays (skip insert).
- **Hash-keyed tables** (news, events, safety): UPSERT via `onConflictDoUpdate` on (cityId, hash). Refreshes assessment fields and fetchedAt on conflict.
- **NINA warnings**: UPSERT on (cityId, warningId, version). Refreshes fetchedAt on conflict.
- **Political districts**: UPSERT on (cityId, level).
- **AI summaries**: Plain INSERT.

### Cache Warming (`warm-cache.ts`)

Runs on server start if DB is connected. Loads all data types for all active cities from Postgres into cache with their standard TTLs. Berlin-only domains (wastewater, bathing, labor market) are guarded with `cityId === 'berlin'`. News items are loaded, filtered via `applyDropLogic`, and written to both digest and per-category cache keys. Errors are logged but don't block startup — each domain is independent.

### Freshness Checks (`warm-cache.ts`)

`findStaleJobs(db, specs)` determines which cron jobs need a startup run. For each `FreshnessSpec` (job name + table name + max age), it queries the latest `fetched_at` from the corresponding table. If the data is missing or older than `maxAgeSeconds`, the job is marked stale. Max ages are set to roughly the cron interval (e.g. 600s for a `*/10` job, 86400s for a daily job). The stale set is used in `app.ts` to conditionally set `runOnStart` on each job — fresh domains skip startup API calls entirely. Without a DB, all domains are marked stale to preserve cache-only behavior.

### Data Retention (`cron/data-retention.ts`)

Nightly cron (3am) prunes old data from all 20 tables. Since writes are INSERT-only (no delete-then-insert), historical data accumulates and this cron is the sole cleanup mechanism. Each table cleanup is independent — one failure doesn't block others.

| Category | Tables | Retention |
|---|---|---|
| Frequent | weather, transit, traffic, construction | 7 days |
| Moderate | news, events, safety, NINA, bathing, pharmacies, appointments, wastewater | 7 days |
| Air quality | air quality grid | 30 days (extended for AQI trend charts) |
| Water levels | water level snapshots | 30 days (extended for water level trend charts) |
| Infrequent | budget, political, social atlas, AEDs | 30 days |
| Labor market | labor market snapshots | 730 days / ~24 months (extended for unemployment trend charts) |
| Summaries | AI summaries | 30 days |

## Patterns

- **Cache-first reads:** Route handlers check cache, then DB (with try/catch + logging), then return empty defaults.
- **Dual writes:** Cron jobs write to cache immediately, then attempt DB write (errors caught, logged, non-fatal).
- **Append-only writes:** DB writes INSERT new rows without deleting old ones. Historical data is cleaned by the nightly retention cron. Hash-keyed tables (news, events, safety, NINA) use UPSERT to avoid duplicates.
- **Optional DB:** Everything works without `DATABASE_URL` — cache-only mode with no persistence across restarts.
- **City isolation:** All cache keys and DB queries are prefixed/filtered by `cityId`. No cross-city data leaks.
- **Berlin-only domains:** Wastewater, bathing, and labor market ingestion hardcode `'berlin'` as cityId. Warm-cache guards these with `cityId === 'berlin'`.
