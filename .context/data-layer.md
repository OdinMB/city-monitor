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
| `{cityId}:weather` | 3600s (1 hr) | ingest-weather |
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
| `feed:{hash}` | 1200s (20 min) | ingest-feeds (raw feed XML) |

## Database (`packages/server/src/db/`)

### Setup (`index.ts`)

ORM: Drizzle (schema-as-code, no code generation). Driver: `postgres` (node-postgres). Connection from `DATABASE_URL` env var. Returns `null` if not set — server runs in cache-only mode.

### Schema (`schema.ts`)

6 tables total. Two write patterns:
- **Unified `snapshots` table**: INSERT-only rows keyed by `type` (concrete data source name). Read latest via `ORDER BY fetchedAt DESC LIMIT 1` filtered by `(cityId, type)`. All former snapshot tables, multi-row batch tables (transit, air quality), UPSERT tables (NINA, political), are now stored as JSONB snapshots.
- **Hash-keyed tables** (news, events, safety): UPSERT on unique keys, avoiding duplicates while preserving history.

Historical data accumulates and is cleaned by the data-retention cron.

| Table | Key Columns | Index |
|---|---|---|
| `snapshots` | cityId, type, data (JSONB), fetchedAt (timestamptz) | `snapshots_city_type_fetched_idx(cityId, type, fetchedAt)` |
| `events` | cityId, title, venue, date, category, url, free, hash | `events_city_date_idx(cityId, date)` |
| `safetyReports` | cityId, title, description, publishedAt, url, district, lat/lon, locationLabel, geoAttempted, hash | `safety_city_published_idx(cityId, publishedAt)`, unique `safety_city_hash_idx(cityId, hash)` |
| `newsItems` | cityId, hash, title, url, publishedAt, category, tier, relevantToCity, importance, lat/lon | `news_city_idx(cityId)`, unique `news_city_hash_idx(cityId, hash)` |
| `geocodeLookups` | query, lat, lon, displayName, provider | `geocode_query_idx(query)` (unique) |
| `aiSummaries` | cityId, headlineHash, summary, model, inputTokens, outputTokens | `summaries_city_generated_idx(cityId, generatedAt)` |

The `snapshots.type` column uses concrete data source names (not categories), so different cities can have different sources for the same data category:

| Type | Source |
|---|---|
| `open-meteo` | Open-Meteo weather API |
| `pegelonline` | PEGELONLINE/WSV water levels |
| `service-berlin` | service.berlin.de appointments (via Firecrawl) |
| `berlin-haushalt` | Berlin Doppelhaushalt budget CSV |
| `viz-roadworks` | VIZ Berlin construction/roadworks |
| `tomtom-traffic` | TomTom traffic incidents |
| `aponet` | aponet.de emergency pharmacies |
| `osm-aeds` | OpenStreetMap AED locations (Overpass) |
| `mss-social-atlas` | MSS 2023 WFS social atlas |
| `lageso-wastewater` | Lageso wastewater viral monitoring |
| `lageso-bathing` | Lageso bathing water quality |
| `ba-labor-market` | Bundesagentur für Arbeit unemployment |
| `afstat-population` | Amt für Statistik demographics |
| `bf-feuerwehr` | Berliner Feuerwehr operations CSV |
| `dwd-pollen` | DWD pollen forecast |
| `sc-dnms` | Sensor.Community noise sensors |
| `oparl-meetings` | OParl/PARDOK council meetings |
| `vbb-disruptions` | VBB/HAFAS transit disruptions |
| `aqi-grid` | WAQI + Sensor.Community air quality |
| `bbk-nina` | BBK NINA civil protection warnings |
| `abgwatch-*` | Abgeordnetenwatch political districts (4 sub-types) |

All tables have `id` (serial PK) and `cityId` (text). Snapshots have `fetchedAt` (timestamptz, default now).

### Reads (`reads.ts`)

All route-facing read functions return `DbResult<T>` (`{ data: T; fetchedAt: Date } | null`). This wrapper ensures routes always have the real `fetchedAt` timestamp from the DB — never `new Date()`. Each function loads the most recent data for a city. Internal `loadSnapshot<T>(db, cityId, type, opts?)` queries the unified `snapshots` table filtered by `(cityId, type)` and `ORDER BY fetchedAt DESC LIMIT 1`. Optional `maxAgeMs` enables staleness guards (3–48h depending on domain) to prevent serving extremely stale data when a cron job has stopped entirely. Named wrappers preserve their original signatures — zero caller changes.
- `loadWeather`, `loadTransitAlerts`, `loadEvents`, `loadSafetyReports`, `loadNewsItems`, `loadSummary`, `loadNinaWarnings`, `loadAirQualityGrid`, `loadWaterLevels`, `loadPoliticalDistricts`, `loadAppointments`
- `loadBudget`, `loadConstructionSites`, `loadTrafficIncidents`, `loadPharmacies`, `loadAeds`, `loadSocialAtlas`, `loadWastewater`, `loadBathingSpots`, `loadLaborMarket`, `loadPopulationGeojson`, `loadPopulationSummary`, `loadFeuerwehr`
- **Historical queries** (used by `/history` endpoints, not cron): `loadWeatherHistory`, `loadAqiHistory`, `loadWaterLevelHistory`, `loadLaborMarketHistory` — each takes `(db, cityId, sinceDays)` and returns `HistoryPoint[]`

### Writes (`writes.ts`)

Two write patterns (no transactions, no deletes — retention cron handles cleanup):
- **Unified snapshots** (21 data sources): Internal `saveSnapshot(db, cityId, type, data)` inserts one JSONB row per ingestion. Named wrappers preserve original signatures. Transit, air quality, NINA, and political data now store arrays/objects as JSONB instead of multi-row batches.
- **Hash-keyed tables** (news, events, safety): UPSERT via `onConflictDoUpdate` on (cityId, hash). Refreshes assessment fields and fetchedAt on conflict.
- **AI summaries**: Plain INSERT.

### Cache Warming (`warm-cache.ts`)

Runs on server start if DB is connected. Loads all data types for all active cities from Postgres into cache with their standard TTLs. Berlin-only domains (wastewater, bathing, labor market) are guarded with `cityId === 'berlin'`. News items are loaded, filtered via `applyDropLogic`, and written to both digest and per-category cache keys. Errors are logged but don't block startup — each domain is independent.

### Freshness Checks (`warm-cache.ts`)

`findStaleJobs(db, specs)` determines which cron jobs need a startup run. For each `FreshnessSpec` (job name + table name + max age), it queries the latest `fetched_at` from the corresponding table. If the data is missing or older than `maxAgeSeconds`, the job is marked stale. Max ages are set to roughly the cron interval (e.g. 600s for a `*/10` job, 86400s for a daily job). The stale set is used in `app.ts` to conditionally set `runOnStart` on each job — fresh domains skip startup API calls entirely. Without a DB, all domains are marked stale to preserve cache-only behavior.

### Data Retention (`cron/data-retention.ts`)

Nightly cron (3am) prunes old data in two phases. Phase 1: time-based deletion for all snapshot types + non-snapshot tables. Phase 2: row-count cap (100 rows per cityId/type) for non-history snapshot types, using `ROW_NUMBER() OVER (PARTITION BY city_id)` raw SQL. Each cleanup task is independent — one failure doesn't block others. Config is split into `HISTORY_RETENTION` (4 time-only entries) and `CAPPED_RETENTION` (20 entries: time + row cap).

| Category | Snapshot types / tables | Retention |
|---|---|---|
| History | open-meteo | 7 days |
| History | aqi-grid, pegelonline | 30 days (trend charts) |
| History | ba-labor-market | 730 days / ~24 months (trend charts) |
| Non-history (high/med freq) | vbb-disruptions, tomtom-traffic, viz-roadworks, bbk-nina, aponet, service-berlin, lageso-wastewater, lageso-bathing, dwd-pollen, sc-dnms, oparl-meetings | 2 days + 100 row cap |
| Non-history (infrequent) | berlin-haushalt, osm-aeds, mss-social-atlas, bf-feuerwehr, afstat-population, abgwatch-* | 7 days + 100 row cap |
| Non-snapshot | news, events, safety | 3 days |
| Summaries | AI summaries; also any whose city has no news items left | 7 days |

## Patterns

- **Cache-first reads:** Route handlers check cache, then DB (with try/catch + logging), then return empty defaults.
- **Dual writes:** Cron jobs write to cache immediately, then attempt DB write (errors caught, logged, non-fatal).
- **Append-only writes:** DB writes INSERT new rows without deleting old ones. Historical data is cleaned by the nightly retention cron. Hash-keyed tables (news, events, safety, NINA) use UPSERT to avoid duplicates.
- **Optional DB:** Everything works without `DATABASE_URL` — cache-only mode with no persistence across restarts.
- **City isolation:** All cache keys and DB queries are prefixed/filtered by `cityId`. No cross-city data leaks.
- **Berlin-only domains:** Wastewater, bathing, and labor market ingestion hardcode `'berlin'` as cityId. Warm-cache guards these with `cityId === 'berlin'`.
