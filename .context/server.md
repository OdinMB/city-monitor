# Server Architecture

## App Factory (`packages/server/src/app.ts`)

`createApp(options?)` builds the Express app. Accepts `{ skipScheduler?: boolean }` for tests and `{ synthetic?: boolean }` for the synthetic dev mode ([dev-database.md](dev-database.md)), which also skips the freshness check, the weather-tiles router and `preCacheBezirke`. `preCacheBezirke` caches the hardcoded Berlin district mayors and logs the re-verify reminder only when Berlin is active.

### Startup Sequence

1. Create Express app with `trust proxy` set to the hop count `TRUST_PROXY_HOPS` (2, measured per path: see [deployment.md](deployment.md#client-address-and-trust-proxy)), compression, helmet, CORS (`ALLOWED_ORIGINS`, by default the production site's origins `citymonitor.app`, `www.citymonitor.app` and `city-monitor-web.onrender.com`, plus `localhost:5173` outside production; the browser calls the API cross-origin), rate limiting in production (100 requests/min per IP; 10/min for bootstrap, and 10/min shared by social-atlas, population, aeds and budget) and JSON middleware. No route reads a request body, so the JSON parser runs with `inflate: false` and `limit: '10kb'`: a compressed body gets 415 without being decompressed, an oversized one 413
2. Create in-memory cache (always)
3. Create DB connection if `DATABASE_URL` set (returns `null` otherwise)
4. Warm cache from Postgres if DB connected — reads run **in parallel** across cities and within each city via `Promise.allSettled`
5. Run freshness check (`findStaleJobs`) — queries the newest `fetched_at` of each domain's table for every active city the job serves. A job is fresh when each of those cities has data newer than its cron interval; a job with any city stale or missing is flagged for startup ingestion ([data-layer.md](data-layer.md#freshness-checks-warm-cachets)). When Berlin is not active, the Berlin-only jobs (`BERLIN_ONLY_JOBS`, see below) are left out of the check
6. Create ingestion functions — each receives cache and optionally db
7. Create scheduler with cron jobs. Only stale domains get `runOnStart: true`; fresh domains skip startup API calls. The exception is `ingest-aq-grid`, which has no freshness spec and always runs on start: its stored grid holds no WAQI stations (see weather.md). Without a DB, all domains are marked stale (preserves cache-only behavior). Startup runs execute **in parallel**, respecting `dependsOn` ordering (e.g. `summarize-news` waits for `ingest-feeds`)
8. Mount routers under `/api` with per-route Cache-Control headers
9. Return `{ app, cache, db, scheduler }`

Entry point (`index.ts`) calls `createApp()` and listens on `PORT` (default 3001). `dev-synthetic.ts` is the dev-only entry for `npm run dev:synthetic`; production never loads it.

### Cache-Control Headers

Applied via middleware per route tier:

| Route | max-age | Rationale |
|---|---|---|
| `/api/:city/bootstrap` | 60s (1 min) | Aggregates every domain |
| `/api/:city/news/*` | 300s (5 min) | Feeds update every 10 min |
| `/api/:city/weather` | 300s (5 min) | Weather updates hourly |
| `/api/:city/transit` | 120s (2 min) | Transit updates every 15 min |
| `/api/:city/events` | 1800s (30 min) | Events update every 6h |
| `/api/:city/safety` | 300s (5 min) | Safety updates every 10 min |
| `/api/:city/nina` | 120s (2 min) | NINA alerts update every 5 min |
| `/api/:city/air-quality` | 600s (10 min) | Air quality updates every 30 min |
| `/api/:city/pharmacies` | 3600s (1h) | Pharmacies update every 6h |
| `/api/:city/traffic` | 120s (2 min) | Traffic updates every 5 min |
| `/api/:city/construction` | 900s (15 min) | Construction updates every 30 min |
| `/api/:city/water-levels` | 300s (5 min) | Water levels update every 15 min |
| `/api/:city/flood-status` | 120s (2 min) | LHP flood status updates every 5 min (its terms: refresh at least every 10) |
| `/api/:city/aeds` | 43200s (12h) | AEDs update daily |
| `/api/:city/social-atlas` | 43200s (12h) | Social atlas updates weekly |
| `/api/:city/budget` | 3600s (1h) | Budget updates daily |
| `/api/:city/appointments` | 3600s (1h) | Appointments update every 12h |
| `/api/:city/bathing` | 43200s (12h) | Bathing quality updates daily |
| `/api/:city/wastewater` | 43200s (12h) | Wastewater updates daily |
| `/api/:city/labor-market` | 3600s (1h) | Labor market updates daily |
| `/api/:city/political/:level` | 3600s (1h) | Political data updates weekly |
| `/api/:city/population`, `/population/summary` | 43200s (12h) | Population updates monthly |
| `/api/:city/feuerwehr` | 43200s (12h) | Feuerwehr updates daily |
| `/api/:city/pollen` | 43200s (12h) | Pollen updates every 6h |
| `/api/:city/noise-sensors` | 300s (5 min) | Noise sensors update every 10 min |
| `/api/:city/council-meetings` | 3600s (1h) | Council meetings update every 6h |
| `/api/weather-tiles/:z/:x/:y.png` | 300s (5 min) | RainViewer radar tiles (not mounted in synthetic mode) |
| `/api/:city/weather/history` | 300s (5 min) | Inherits the weather router's value; up to 7d |
| `/api/:city/water-levels/history` | 300s (5 min) | Inherits the water-levels router's value; up to 30d |
| `/api/:city/labor-market/history` | 3600s (1h) | Inherits the labor-market router's value; up to 730d |

`/api/health` sets no Cache-Control.

## Scheduler (`packages/server/src/lib/scheduler.ts`)

Wrapper around `node-cron` with job metadata tracking. Supports `dependsOn?: string[]` for startup ordering — jobs with unmet dependencies wait; all others run in parallel.

### Jobs (27, defined in app.ts)

| Job | Schedule | Description |
|---|---|---|
| `ingest-feeds` | `*/10 * * * *` | Fetch RSS feeds, classify, cache digest |
| `summarize-news` | `5 */6 * * *` | AI summary of top headlines |
| `ingest-weather` | `0 * * * *` | BrightSky forecast + DWD alerts and UV; Open-Meteo air quality |
| `ingest-transit` | `*/15 * * * *` | VBB departure disruptions |
| `ingest-events` | `0 */6 * * *` | kulturdaten.berlin, Ticketmaster and gomus events (Berlin); Stadt Köln open-data events |
| `ingest-safety` | `*/10 * * * *` | Police RSS |
| `ingest-nina` | `*/5 * * * *` | NINA civil protection warnings |
| `ingest-aq-grid` | `*/30 * * * *` | WAQI stations + Sensor.Community (PM→EAQI) grid; caches both, stores only the Sensor.Community points (WAQI terms, see weather.md) |
| `ingest-pharmacies` | `0 */6 * * *` | aponet.de emergency pharmacies |
| `ingest-traffic` | `*/5 * * * *` | TomTom traffic incidents |
| `ingest-construction` | `*/30 * * * *` | Roadworks by provider: VIZ Berlin, Hamburg OGC API, Köln WFS, München WFS ([roadworks.md](roadworks.md)) |
| `ingest-water-levels` | `*/15 * * * *` | PEGELONLINE river gauge stations |
| `ingest-flood-status` | `*/5 * * * *` | LHP flood class of state gauges and flood warnings, for cities with `dataSources.floodStatus` (München's Isar; [water-levels.md](water-levels.md#flood-status-lhp)). Two requests per state per run |
| `ingest-appointments` | `0 6,18 * * *` | Firecrawl-scraped Bürgeramt appointment availability. One scrape per service per run (~600 a month for Berlin's 10); twice a day to keep Firecrawl usage down, the morning run after offices release new slots |
| `ingest-aeds` | `0 0 * * *` | OpenStreetMap AED locations (daily) |
| `ingest-social-atlas` | `0 5 * * 0` | MSS WFS social atlas GeoJSON (weekly) |
| `ingest-budget` | `0 6 * * *` | Berlin Haushalt budget data (daily) |
| `ingest-bathing` | `0 6 * * *` | LAGeSo bathing water quality (daily, Berlin-only) |
| `ingest-wastewater` | `0 6 * * *` | LAGeSo wastewater viral loads (daily, Berlin-only) |
| `ingest-labor-market` | `0 7 * * *` | BA unemployment statistics (daily, Berlin-only) |
| `ingest-political` | `0 4 * * 1` | abgeordnetenwatch.de representatives (weekly; skips the API only when the stored data is under 6 days old, so every weekly run refreshes) |
| `ingest-population` | `0 6 1 * *` | Amt für Statistik population demographics (monthly, Berlin-only) |
| `ingest-feuerwehr` | `0 8 * * *` | Berliner Feuerwehr operations (daily, Berlin-only) |
| `ingest-pollen` | `0 */6 * * *` | DWD pollen forecast |
| `ingest-noise-sensors` | `*/10 * * * *` | Sensor.Community DNMS noise sensors |
| `ingest-council-meetings` | `0 */6 * * *` | BVV OParl + Abgeordnetenhaus PARDOK (Berlin), Bürgerschaft website calendar (Hamburg), SessionNet OParl 1.1 (Köln), RIS RSS (München) |
| `data-retention` | `0 3 * * *` | Prune old data (nightly) |

Ingestion jobs use conditional `runOnStart` based on DB freshness checks — only stale/missing domains trigger startup API calls. `ingest-aq-grid` always runs on start, and `data-retention` never does. `summarize-news` has `dependsOn: ['ingest-feeds']`, `ingest-population` has `dependsOn: ['ingest-social-atlas']`.

**Which cities a job serves.** Most jobs loop over `getActiveCities()` and skip a city without the matching `dataSources` entry (budget, appointments, social atlas, council meetings, noise sensors, roadworks, transit, events…), so they fetch nothing for a city that lacks the source. Each job's `FRESHNESS_SPECS` entry in `app.ts` repeats that filter as its `serves` predicate, so the startup check looks only at the cities the job writes rows for; change the two together. `ingest-appointments` (paid Firecrawl calls) is the one job without it, and keeps the table-wide check ([data-layer.md](data-layer.md#freshness-checks-warm-cachets)). Five jobs have no config entry because their source covers Berlin only, with a hardcoded URL and rows written under `'berlin'`: `ingest-bathing`, `ingest-wastewater`, `ingest-labor-market`, `ingest-population` and `ingest-feuerwehr`. Each handler returns before any request when `getCityConfig('berlin')` is undefined, and `app.ts` lists them in `BERLIN_ONLY_JOBS` so that, without Berlin, they are left out of the freshness check and get no startup run. They stay scheduled (the health endpoint lists all 27 jobs) and their ticks do nothing. With Berlin active, alone or with other cities, they make the same requests and writes as before. A new Berlin-only source without a config entry follows the same two steps ([new-data-sources.md](new-data-sources.md)).

**Political data** (`ingest-political.ts`, served at `/api/:city/political/:level`). abgeordnetenwatch.de API v2 (CC0 1.0) for the current Bundestag and state legislature, one city at a time, for each city in `PARLIAMENT_CONFIG`. Levels: `bundestag` and `state` (members grouped by constituency), `state-bezirke` (state members by Bezirk, Berlin only, `STATE_CONSTITUENCY_BEZIRKE`), and two hand-kept levels with a source page and `lastVerified` date each (the server warns 180 days after it): `bezirke` (`BEZIRKSBUERGERMEISTER`, Berlin and Köln) and `mayor` (`OBERBUERGERMEISTER`, Köln and München). Whose mandates count:
- A city-state (Berlin, Hamburg; no `constituencies`): every member of the state parliament, and the Bundestag members whose constituency or Landesliste label names the city.
- A city inside a state (Köln, München): `constituencies: { bundestag, state }` names the constituencies within the city, as abgeordnetenwatch labels them without number and period. Members count when their candidacy was in one of them, whether they won it or came in through a list, so a list member who stood elsewhere in the state is left out. Köln: Bundestag Köln I–III and Leverkusen – Köln IV (shared with Leverkusen), Landtag NRW Köln I–VII. München: Bundestag München-Nord/-Ost/-Süd/-West/Mitte (not München-Land, the Landkreis), Bayerischer Landtag the nine Stimmkreise 101–109; Bavaria gives list seats per Wahlkreis (Oberbayern), but every list candidate also stands in a Stimmkreis, which places them. München's CDU/CSU Bundestag members show as CSU (`unionParty`). A configured name no mandate stood in is logged; a level where no mandate matches keeps its previous data rather than going empty.
- The period is looked up on each run (`fetchCurrentPeriod`: the newest period of type `legislature`, as `election` periods hold no mandates), so a new legislature is picked up without a code change. Berlin's is "Berlin 2026 - 2031" (id 176) since 2026-10-29; its 78 Wahlkreise keep the "`<Bezirk> <n>`" names `state-bezirke` relies on (checked 2026-11-01), now with four-digit numbers from Marzahn-Hellersdorf on ("1001 - Marzahn-Hellersdorf 1 (Berlin 2026 - 2031)").
The map's political layer needs Bezirk outlines whose names the constituencies carry, so Köln and München have the tile only ([frontend.md](frontend.md)).

### API

- `getJobs(): JobInfo[]` — name, schedule, lastRun, lastFailure, running, nextRun (for health endpoint). A scheduled tick is skipped while the previous run of the same job is still `running`
- `stop(): void` — stops all cron tasks (for graceful shutdown)
- `triggerJob(name): Promise<boolean>` — runs one job now; returns `false` for an unknown or already-running job (used by the dev-only trigger endpoint)

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
  "scheduler": { "jobs": [{ "name": "...", "lastRun": "...", "lastFailure": null, "running": false }] },
  "ai": { "gpt-6-luna:berlin": { "model": "gpt-6-luna", "input": 5000, "output": 250, "calls": 5, "estimatedCostUsd": 0.0049 } }
}
```

`ai` comes from `getUsageStats()` in `lib/openai.ts`, keyed `{model}:{city}`. Outside production the router also exposes `POST /api/health/trigger/:jobName`, which calls `scheduler.triggerJob()`.

## Bootstrap Endpoint

`GET /api/:city/bootstrap` (in `routes/bootstrap.ts`) returns 22 data slots in one response for fast initial page load: news, weather, transit, events, safety, nina, airQuality, pharmacies, aeds, traffic, construction, waterLevels, floodStatus, budget, appointments, laborMarket, wastewater, populationSummary, feuerwehr, pollen, noiseSensors, councilMeetings. It is cache-only (`cache.getBatchWithMeta(CK.bootstrapKeys(cityId))`, no DB fallback), so a cold slot is `null`.

## City Configuration (`packages/server/src/config/`)

- `index.ts` — `getActiveCities()` reads `ACTIVE_CITIES` env var (comma-separated IDs, default "berlin"; the Render blueprint sets `berlin,hamburg,koeln,muenchen`), returns matching `CityConfig[]`. `getCityConfig(id)` for single lookup.
- `lib/city-features.ts` — `cityFeatures(city)` lists the features the server ingests for a city, from the same conditions the jobs check; the web configs' `features` must match (`.context/frontend.md`, "City Context").
- News and police map pins: a geocoded place outside the city's `boundingBox` gets no coordinates (`insideCity` in `lib/openai.ts`), since the classifier's location examples are Berlin's and the geocoder searches all of Germany.
- `cities/berlin.ts` — Berlin config with 6 RSS feeds, weather (BrightSky), transit (VBB via `v6.vbb.transport.rest`, 12 stations), events (kulturdaten.berlin, Ticketmaster, gomus), police (berlin.de press-release RSS of Polizei Berlin), roadworks (VIZ Berlin).
- `cities/hamburg.ts` — Hamburg config with 3 RSS feeds (NDR, MOPO, Feuerwehr Hamburg on presseportal.de; licence verdicts in `news.md`), weather (BrightSky), police (Polizei Hamburg's presseportal.de RSS), roadworks (the Bauweiser OGC API, [roadworks.md](roadworks.md)), council meetings from the Bürgerschaft's website calendar (`councilMeetings.hamburgBuergerschaft`, [council-meetings.md](council-meetings.md); no Bezirksversammlung source). No transit config, so Hamburg has no transit alerts.
- `cities/koeln.ts` — Köln config with the Germany-wide sources: weather (BrightSky, DWD warnings by the warn region `Stadt Köln`), NINA (ARS `053150000000`), defibrillators from the OSM boundary at admin level 6, DWD pollen (region 40/41) and the PEGELONLINE Rhein gauge Köln; roadworks (the city's WFS, 10 layers, permit periods); plus 4 feeds (WDR Rheinland, Kölner Stadt-Anzeiger, EXPRESS, Stadt Köln; licence verdicts in `news.md`) and police (Polizei Köln's presseportal.de RSS, which also covers Leverkusen), both since 2026-11-01, so Köln makes LLM calls (classification, briefing in de/en, police places); the city's own events (`stadt-koeln` open data, [events-safety.md](events-safety.md#events)) and council meetings from its SessionNet OParl 1.1 body (`councilMeetings.oparlBody`, [council-meetings.md](council-meetings.md)). No transit. Active in the web build; served when `ACTIVE_CITIES` names `koeln`.
- `cities/muenchen.ts` — München config with 2 feeds since 2026-11-01 (BR24 Oberbayern, an RSS 1.0/RDF feed, and Feuerwehr München on presseportal.de), so it makes LLM calls for classification and the de/en briefing; no police feed (`events-safety.md`). Roadworks from the Geoportal WFS, filtered server-side; council meetings from the RIS RSS feeds (`councilMeetings.muenchenRis`, [council-meetings.md](council-meetings.md)); no transit or events (no open events feed exists). Otherwise the Germany-wide sources, like Köln: weather (BrightSky, DWD UV matched by the name `München`, DWD warnings by the warn region `Kreis und Stadt München`, which DWD uses for city and Landkreis together), NINA (ARS `091620000000`), defibrillators from the OSM boundary at admin level 6, DWD pollen (region 120/121). No river level: the Isar through München is a Bavarian water, not on PEGELONLINE; the flood class of the Isar gauges München and Puppling comes from the LHP instead (`floodStatus`, [water-levels.md](water-levels.md#flood-status-lhp)). Active in the web build; served when `ACTIVE_CITIES` names `muenchen`.

Adding a city = adding a config file + registering in `ALL_CITIES` + setting `ACTIVE_CITIES` env var, plus the web side (its own config file, `ALL_CITIES` and the hardcoded `ACTIVE_CITY_IDS` in `packages/web/src/config/index.ts`). The full steps, including the code keyed to a city ID, are in the `add-city` skill (`.claude/skills/add-city/SKILL.md`) and the README's "Adding a City".

## Environment Variables

The one list, with what each variable gates, is in [`deployment.md`](deployment.md#environment-variables). Keep it there when adding a `process.env` read.

**Reasoning effort values** depend on the model family. `gpt-5`, `gpt-5-mini`, `gpt-5-nano` (dated or not): `minimal | low | medium | high`. `gpt-5.<n>-*` and `gpt-6-*`: `none | low | medium | high | xhigh | max` (GPT-6 rejects `minimal`). A value outside the model's set is logged and treated as unset. Unset falls back to the site's default effort (summaries `high`, news `medium`, police `none`) when the model supports it; otherwise no effort is sent and the API default applies. So a rollback such as `OPENAI_GEO_MODEL=gpt-5-nano` sends exactly the pre-GPT-6 request. `OPENAI_FILTER_MODEL=gpt-5-nano` rolls back both sites, but news then sends `reasoning_effort: medium` explicitly, because gpt-5-nano supports it; that is the family's API default, so behaviour matches the old request. A briefing rollback needs both variables: `OPENAI_MODEL=gpt-5-mini` alone sends `gpt-5-mini@high` (gpt-5-mini supports `high`), so add `OPENAI_SUMMARY_EFFORT=medium` to get the old request's effort. `OPENAI_FILTER_MODEL=gpt-5.6-luna` alone gives news `gpt-5.6-luna@medium` and police `gpt-5.6-luna@none`. Effort reaches the API through `modelKwargs.reasoning_effort` — LangChain's own `reasoning` option is silently dropped for `gpt-6-*` IDs by @langchain/openai 1.2.x. Max tokens, temperature and top_p are never set.

## Utility Libraries

| File | Purpose |
|---|---|
| `lib/hash.ts` | `hashString`: SHA-256 truncated to 12 hex characters. Used for dedup and cache keys everywhere. |
| `lib/cache-keys.ts` | `CK`, the one source of cache key strings, including `CK.bootstrapKeys(cityId)`. |
| `lib/validate-city.ts` | `validateCity` middleware on `/api/:city`: a malformed id gets 400, an unknown or inactive city 404. |
| `lib/brightsky.ts` | BrightSky forecast fetch, icon → WMO code mapping, apparent temperature, daily roll-up. |
| `lib/rate-gate.ts` | Serializes concurrent calls with minimum gap. Factory: `createRateGate(minGapMs)`. |
| `lib/rss-parser.ts` | RSS 2.0 + Atom parser using `fast-xml-parser`. Returns `FeedItem[]`. |
| `lib/openai.ts` | The LLM call sites (`summarizeHeadlines`, `filterAndGeolocateNews`, `geolocateReports`) and per-model, per-city token usage (`getUsageStats`). |
| `lib/geocode.ts` | Nominatim-first geocoding (1 QPS, free). Falls back to LocationIQ when rate-limited and `LOCATIONIQ_TOKEN` is set. |
| `lib/parse-history.ts` | `parseHistoryDays(raw, maxDays)` parses the `?range=Nd` query param of the history endpoints; a value above `maxDays` or malformed returns `null`, and the route then uses its default. |
| `lib/llm-client.ts` | Per-call-site model + reasoning effort (`resolveSiteTarget`; `defaultSiteTarget` gives the code default without env), `getModel`, the single structured-output call path `invokeStructured`, and `MODEL_PRICING`. |
| `lib/llm-prompts.ts` | The three LLM prompts and Zod schemas behind request builders (`buildBriefingRequest`, `buildFilterRequest`, `buildGeoRequest`), shared by production and the model-eval harness. |
