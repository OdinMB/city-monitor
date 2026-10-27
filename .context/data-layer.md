# Data Layer: Database & Cache

## Architecture

Postgres is the source of truth. An in-memory Map is the hot read layer in front of it. API reads hit the cache first; on miss, query Postgres; on miss, return empty defaults. Cron jobs write to both cache and DB.

## In-Memory Cache (`packages/server/src/lib/cache.ts`)

Factory: `createCache()` returns a `Cache` object. Adapted from worldmonitor's Redis cache — replaced Redis with a plain `Map<string, CacheEntry>`.

### API

| Method | Description |
|---|---|
| `get<T>(key)` | Synchronous. Returns null if expired or missing. |
| `set(key, data, ttlSeconds, fetchedAt?)` | Stores with absolute expiry timestamp. `fetchedAt` (default now) is the data's real fetch time, which `getWithMeta` reports; DB fallbacks and cache warming pass the row's `fetchedAt`. |
| `delete(key)` | Removes entry. |
| `fetch<T>(key, ttl, fetcher, negTtl?)` | Async lazy-load with in-flight coalescing. Concurrent calls for the same key share a single promise. A fetcher result of `null` is negative-cached for `negTtl` seconds (default 120s) to avoid thundering herd. |
| `getWithMeta<T>(key)` | `{ data, fetchedAt }` (ISO string) or null. Used by the route handlers, whose responses carry `fetchedAt`. |
| `getBatch(keys)` | Returns `Record<key, value>` for all non-null entries. |
| `getBatchWithMeta(keys)` | `getWithMeta` for several keys. Used by the bootstrap endpoint. |
| `size()` | Entry count (for health endpoint). |
| `clear()` | Empties store and in-flight map. Used in tests. |

### Cache Keys & TTLs

| Key pattern | TTL | Writer |
|---|---|---|
| `{cityId}:weather` | 3600s (1 hr) | ingest-weather |
| `{cityId}:air-quality` | 3600s (1 hr) | ingest-weather (current AQI from Open-Meteo) |
| `{cityId}:transit:alerts` | 1200s (20 min) | ingest-transit |
| `{cityId}:events:upcoming` | 21600s (6h) | ingest-events |
| `{cityId}:safety:recent` | 900s (15 min) | ingest-safety |
| `{cityId}:news:digest` | 900s (15 min) | ingest-feeds |
| `{cityId}:news:{category}` | 900s (15 min) | ingest-feeds |
| `{cityId}:news:summary` | 86400s (24h) | summarize |
| `{cityId}:air-quality:grid` | 2160s (36 min, cron interval + 20%; `AQ_GRID_TTL_SECONDS`, also used by the route's DB fallback and cache warming) | ingest-aq-grid |
| `{cityId}:air-quality:sc-cache` | 7200s (2h) | ingest-aq-grid (last reading per Sensor.Community station, pruned after 2h) |
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
| `{cityId}:appointments` | 43200s (12h) | ingest-appointments |
| `{cityId}:nina:warnings` | 600s (10 min) | ingest-nina |
| `{cityId}:population:geojson` | 3214080s (37.2 days) | ingest-population (Berlin-only) |
| `{cityId}:population:summary` | 3214080s (37.2 days) | ingest-population (Berlin-only) |
| `{cityId}:feuerwehr` | 86400s (24h) | ingest-feuerwehr (Berlin-only) |
| `{cityId}:pollen` | 86400s (24h) | ingest-pollen |
| `{cityId}:noise-sensors` | 1200s (20 min) | ingest-noise-sensors |
| `{cityId}:council-meetings` | 25920s (7.2h) | ingest-council-meetings |
| `{cityId}:weather:history:{N}d` | 1800s (30 min) | history endpoint (lazy) |
| `{cityId}:water-levels:history:{N}d` | 900s (15 min) | history endpoint (lazy) |
| `{cityId}:labor-market:history:{N}d` | 86400s (24h) | history endpoint (lazy) |
| `feed:{hash of feed URL}` | 1200s (20 min) | ingest-feeds (the feed's parsed `NewsItem[]`, via `cache.fetch`) |

Keys are built with the `CK.*` helpers in `lib/cache-keys.ts`. Cache warming and DB fallbacks in the routes may set a different TTL than the cron job (see Cache Warming).

A TTL must outlast the longest gap between the runs that refresh the key, or the key goes empty before the next run. Population (monthly, so up to 31 days) is cached for that gap × 1.2 (`POPULATION_TTL_SECONDS`, shared by ingestion, the routes' DB fallback and cache warming). Retention keeps the newest `afstat-population` row (see Data Retention), so with a database the routes' fallback can also refill an expired entry; without one the cache is the only copy.

## Database (`packages/server/src/db/`)

### Setup (`index.ts`)

ORM: Drizzle (schema-as-code, no code generation). Driver: `postgres` (postgres.js, via `drizzle-orm/postgres-js`; pool of 10). Connection from `DATABASE_URL` env var. `createDb()` returns `{ db, client }`, or `null` if it is not set — server runs in cache-only mode.

### Schema (`schema.ts`)

6 tables total. Two write patterns:
- **Unified `snapshots` table**: INSERT-only rows keyed by `type` (concrete data source name). Read latest via `ORDER BY fetchedAt DESC LIMIT 1` filtered by `(cityId, type)`. All former snapshot tables, multi-row batch tables (transit, air quality), UPSERT tables (NINA, political), are now stored as JSONB snapshots.
- **Hash-keyed tables** (news, events, safety): UPSERT on unique keys, avoiding duplicates while preserving history.

Historical data accumulates and is cleaned by the data-retention cron.

| Table | Key Columns | Index |
|---|---|---|
| `snapshots` | cityId, type, data (JSONB), fetchedAt (timestamptz) | `snapshots_city_type_fetched_idx(cityId, type, fetchedAt)` |
| `events` | cityId, title, venue, date, endDate, category, url, description, free, hash, source, price | `events_city_date_idx(cityId, date)`, `events_city_source_idx(cityId, source, date)`, unique `events_city_hash_idx(cityId, hash)` |
| `safetyReports` | cityId, title, description, publishedAt, url, district, lat/lon, locationLabel, geoAttempted, hash | `safety_city_published_idx(cityId, publishedAt)`, unique `safety_city_hash_idx(cityId, hash)` |
| `newsItems` | cityId, hash, title, url, publishedAt, category, tier, relevantToCity, importance, lat/lon | `news_city_idx(cityId)`, `news_city_published_idx(cityId, publishedAt)`, unique `news_city_hash_idx(cityId, hash)` |
| `geocodeLookups` | query, lat, lon, displayName, provider | `geocode_query_idx(query)` (unique) |
| `aiSummaries` | cityId, lang, headlineHash, summary, model, inputTokens, outputTokens | `summaries_city_generated_idx(cityId, generatedAt)` |

The `snapshots.type` column uses concrete data source names (not categories), so different cities can have different sources for the same data category:

| Type | Source |
|---|---|
| `open-meteo` | Weather from BrightSky + DWD (historical key name, see `weather.md`) |
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
| `aqi-grid` | Sensor.Community air quality points; the WAQI stations of the same grid are cached, never stored ([weather.md](weather.md#waqi-terms-shown-live-not-archived-credited)) |
| `bbk-nina` | BBK NINA civil protection warnings |
| `abgwatch-*` | Abgeordnetenwatch political districts (4 sub-types) |

All tables have `id` (serial PK), and all but `geocodeLookups` have `cityId` (text). Snapshots have `fetchedAt` (timestamptz, default now).

### Reads (`reads.ts`)

All route-facing read functions return `DbResult<T>` (`{ data: T; fetchedAt: Date } | null`). This wrapper ensures routes always have the real `fetchedAt` timestamp from the DB — never `new Date()`. Each function loads the most recent data for a city. Internal `loadSnapshot<T>(db, cityId, type, opts?)` queries the unified `snapshots` table filtered by `(cityId, type)` and `ORDER BY fetchedAt DESC LIMIT 1`. Optional `maxAgeMs` enables staleness guards (2–48h depending on domain: noise sensors 2h, NINA 3h, AQ grid 6h, pollen and council meetings 48h; `loadEvents` applies its own 48h guard) to prevent serving extremely stale data when a cron job has stopped entirely. Named wrappers preserve their original signatures — zero caller changes.
- `loadWeather`, `loadTransitAlerts`, `loadEvents`, `loadSafetyReports`, `loadNewsItems`, `loadSummary`, `loadNinaWarnings`, `loadAirQualityGrid`, `loadWaterLevels`, `loadPoliticalDistricts`, `loadPoliticalFetchedAt`, `loadAppointments`
- `loadBudget`, `loadConstructionSites`, `loadTrafficIncidents`, `loadPharmacies`, `loadAeds`, `loadSocialAtlas`, `loadWastewater`, `loadBathingSpots`, `loadLaborMarket`, `loadPopulationGeojson`, `loadPopulationSummary`, `loadFeuerwehr`, `loadPollen`, `loadNoiseSensors`, `loadCouncilMeetings`
- Cron-side reads (not route-facing, no `DbResult`): `loadSafetyGeoState` (safety cron), `loadAllNewsAssessments` (feed cron), `loadGeocodeLookup` / `loadAllGeocodeLookups` (geocoder and cache warming)
- **Historical queries** (used by `/history` endpoints, not cron): `loadWeatherHistory`, `loadWaterLevelHistory`, `loadLaborMarketHistory` — each takes `(db, cityId, sinceDays)` and returns `HistoryPoint[]`. Air quality has none: the stored grid is kept 6 hours and holds no WAQI stations.

### Writes (`writes.ts`)

Two write patterns (no transactions, no deletes — retention cron handles cleanup):
- **Unified snapshots** (21 data sources): Internal `saveSnapshot(db, cityId, type, data)` inserts one JSONB row per ingestion. Named wrappers preserve original signatures. Transit, air quality, NINA, and political data now store arrays/objects as JSONB instead of multi-row batches.
- **Hash-keyed tables** (news, events, safety): UPSERT via `onConflictDoUpdate` on (cityId, hash). Refreshes assessment fields and fetchedAt on conflict.
- **AI summaries**: Plain INSERT.

The synthetic dev seed (`synthetic/seed.ts`, see [dev-database.md](dev-database.md)) writes through these same functions into a local database only.

### Cache Warming (`warm-cache.ts`)

Runs on server start if DB is connected. First loads every geocode lookup into the geocoder's in-process map, then all data types for all active cities from Postgres into cache. Frequently refreshed domains get their cron interval plus 20% as TTL (weather 4320s, transit and water levels 1080s, news and safety 720s, NINA and traffic 360s, AQ grid and construction 2160s, events and pharmacies 25920s, appointments 51840s); the rest get the cron job's own TTL. Berlin-only domains (wastewater, bathing, labor market, population GeoJSON and summary, Feuerwehr, noise sensors, council meetings) are guarded with `cityId === 'berlin'`. The warmed AQ grid, like the air-quality route's DB fallback, has Sensor.Community points only; the WAQI stations come back with the `ingest-aq-grid` run that every start triggers. News items are loaded, filtered via `applyDropLogic`, and written to both digest and per-category cache keys. Errors are logged but don't block startup — each domain is independent.

### Freshness Checks (`warm-cache.ts`)

`findStaleJobs(db, specs)` determines which cron jobs need a startup run. Each `FreshnessSpec` names a job, its table (with an optional row filter, the snapshot `type`), a max age and the active cities the job serves (`cityIds`). One query per spec reads the newest timestamp of each of those cities (`MAX(...) … GROUP BY city_id`). The job is stale when any of them has no row, or only rows older than `maxAgeSeconds`, so a city newly added to `ACTIVE_CITIES` gets its data at startup instead of at each job's next scheduled run (hours to a month later). A job that serves none of the active cities is never stale and sends no query. Max ages are set to roughly the cron interval (e.g. 600s for a `*/10` job, 86400s for a daily job). The stale set is used in `app.ts` to conditionally set `runOnStart` on each job — when every served city is fresh, the job skips its startup API calls entirely. The startup log names the cities that lack data, e.g. `will refresh: ingest-weather (hamburg)`.

`app.ts` derives `cityIds` from each spec's `serves` predicate, which mirrors the city filter in the job's handler: a `dataSources` entry, `country === 'DE'`, a feed list, `hasParliamentConfig` (political), or Berlin for the Berlin-only jobs. A predicate that accepts a city its handler skips would rerun the job on every start, so change both together. `ingest-appointments` alone has no `serves` and keeps the table-wide check: the newest row of any city decides, as it did before the per-city check. Its Firecrawl calls are paid, so adding a city with an appointments entry must not add startup runs. `ingest-aq-grid` has no spec and always runs on start, because its stored grid holds no WAQI stations. Without a DB, all domains are marked stale to preserve cache-only behavior.

### Data Retention (`cron/data-retention.ts`)

Nightly cron (3am) prunes old data in two phases. Phase 1: time-based deletion for all snapshot types + non-snapshot tables. Phase 2: row-count cap (100 rows per cityId/type) for non-history snapshot types, using `ROW_NUMBER() OVER (PARTITION BY city_id ORDER BY fetched_at DESC)` raw SQL; it keeps rows 1–100, so it never removes the newest. Each cleanup task is independent — one failure doesn't block others. Config is split into `HISTORY_RETENTION` (3 time-only entries) and `CAPPED_RETENTION` (21 entries: time + row cap).

**Keep-latest is opt-in (`keepLatest: true` on a config entry).** By default Phase 1 deletes snapshot rows by age alone, the newest included. A `keepLatest` type never loses its newest row per (cityId, type) by age: Phase 1 skips the row with the latest `fetchedAt`, and of rows tied on it the highest `id`, so exactly one stays (`id NOT IN` a `SELECT DISTINCT ON (city_id) id … ORDER BY city_id, fetched_at DESC, id DESC` subquery of the same type). Only types whose job runs no more often than their retention period get it, since those lose their only row after one failed run (or, if monthly, every month): `mss-social-atlas` and `abgwatch-*` (weekly, 7-day retention) and `afstat-population` (monthly). They so keep a row for cache warming and the routes' DB fallback after a restart, and population's change figure has a previous snapshot to compare with. Their reads have no `maxAgeMs` guard, so after a long outage the kept row is served old, with its real `fetchedAt`. Frequently fetched types stay age-only, so a stopped job leaves them empty rather than stale; `aqi-grid` must stay age-only ([weather.md](weather.md#waqi-terms-shown-live-not-archived-credited)).

| Category | Snapshot types / tables | Retention |
|---|---|---|
| History | open-meteo | 7 days |
| History | pegelonline | 30 days (history endpoint) |
| History | ba-labor-market | 730 days / ~24 months (history endpoints) |
| Non-history (short-lived) | aqi-grid | 6 hours, the age limit of `loadAirQualityGrid` (`AQ_GRID_MAX_AGE_MS`), newest row included (never `keepLatest`) + 100 row cap. Kept no longer than a read can use it, so no air-quality archive builds up ([weather.md](weather.md#waqi-terms-shown-live-not-archived-credited)) |
| Non-history (high/med freq) | vbb-disruptions, tomtom-traffic, viz-roadworks, bbk-nina, aponet, service-berlin, lageso-wastewater, lageso-bathing, dwd-pollen, sc-dnms, oparl-meetings | 2 days + 100 row cap |
| Non-history (infrequent, daily jobs) | berlin-haushalt, osm-aeds, bf-feuerwehr | 7 days + 100 row cap |
| Non-history (infrequent, weekly/monthly jobs) | mss-social-atlas, afstat-population, abgwatch-* | 7 days, newest row per city kept (`keepLatest`) + 100 row cap |
| Non-snapshot | news, events, safety | 3 days |
| Summaries | AI summaries; also any whose city has no news items left | 7 days |

## Patterns

- **Cache-first reads:** Route handlers check cache, then DB (with try/catch + logging), then return empty defaults.
- **Dual writes:** Cron jobs write to cache immediately, then attempt DB write (errors caught, logged, non-fatal).
- **Append-only writes:** DB writes INSERT new rows without deleting old ones. Historical data is cleaned by the nightly retention cron. Hash-keyed tables (news, events, safety) use UPSERT to avoid duplicates; NINA warnings are a JSONB snapshot like the other snapshot types.
- **Optional DB:** Everything works without `DATABASE_URL` — cache-only mode with no persistence across restarts.
- **City isolation:** All cache keys and DB queries are prefixed/filtered by `cityId`. No cross-city data leaks.
- **Berlin-only domains:** Wastewater, bathing, labor market, population and Feuerwehr ingestion hardcode `'berlin'` as cityId. Each job returns before fetching when Berlin is not active, and gets no freshness check or startup run then ([server.md](server.md#jobs-26-defined-in-appts)). Noise sensors and council meetings are Berlin-only through config (only `berlin.ts` has `dataSources.noiseSensors` / `councilMeetings`). Warm-cache guards all of these with `cityId === 'berlin'`.
