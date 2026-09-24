# GPT-6 migration, phase 1: model plumbing, police re-send fix, eval harness

- **Date**: 2026-09-24
- **Status**: implemented (commits A–C, 2026-09-24); the paid eval run and the owner's rating are still to do
- **Type**: feature
- **Complexity**: complex

This is phase 1 of the GPT-6 migration. It builds everything up to the owner's blind rating. Phase 2 comes later as a separate step and flips the production defaults once the ratings are in. **Before changing any file**, run `git -C city-monitor pull --ff-only` from `D:/projects`. The plan review ran it on 2026-09-24: "Already up to date" at `c151975`. The working tree then held only this plan (untracked) and an uncommitted `DOCS/` line in `.gitignore` left by another run. Run the pull again anyway; if it changes any file listed below, re-check this plan against it.

Sources: the research brief and the verified per-project recommendations from 2026-09-24. A formatted copy may be at `DOCS/2026-09-24_gpt6-model-review.md`. The plan depends on these facts, which were re-checked in `node_modules/@langchain/openai` 1.2.11:
- `utils/misc.js` `isReasoningModel()` only matches `/^o\d/` and `gpt-5*`. For `gpt-6-*` IDs, `_getReasoningParams()` returns `undefined`, so a `reasoning: { effort }` option is silently dropped. For the same IDs, a `maxTokens` value would be sent as `max_tokens`. `completions.js` spreads `...this.modelKwargs` into the request, so `modelKwargs: { reasoning_effort }` reaches the API for both gpt-5 and gpt-6 IDs.
- `withStructuredOutput(zod, { includeRaw: true })` sends `response_format: json_schema`, not tools. If parsing fails it returns `parsed: null` rather than throwing; API errors do throw. GPT-6's rule that Chat Completions function calling only works at effort `none` therefore does not apply, as long as nobody switches to `method: 'functionCalling'`.
- Effort values: GPT-6 Sol and Luna accept `none | low | medium (default) | high | xhigh | max` and reject `minimal`. gpt-5.6-luna (the fallback) accepts the same set, `none` to `max`. gpt-5, gpt-5-mini and gpt-5-nano accept `minimal | low | medium (default) | high` and have no `none`, `xhigh` or `max`.
- `gpt-5.6-luna` starts with `gpt-5`, so LangChain treats it as a reasoning model (`max_completion_tokens`, `developer` role). `gpt-6-*` is treated as a non-reasoning model (`max_tokens`, `system` role). Neither matters as long as `maxTokens` is never set; `modelKwargs.reasoning_effort` reaches the API for both.
- On Chat Completions, LangChain 1.2.11 does not surface a model refusal: the converter does not copy `message.refusal` into `additional_kwargs`, so a refusal appears as empty content and a `parsed: null` result.

## Problem

All three LLM call sites run on `gpt-5-nano` or `gpt-5-mini`: news classification with location labels, police-report location extraction, and the multilingual briefing. The only snapshots behind those models shut down on 2026-12-11. The code cannot select a GPT-6 model correctly. Reasoning effort cannot be configured, and the obvious way to pass it is silently dropped by LangChain. The cost figures in `/api/health` use wrong prices, and nothing measures whether a new model is good enough. Separately, police reports that cannot be placed on the map are sent to the LLM again every 10 minutes until they drop out of the feed.

## Approach

The work is three commits on `main`, kept local and never pushed. A later eval run then writes the owner's deliverable into `DOCS/2026-09-24_gpt6-eval/`.

**A — LLM plumbing, with defaults unchanged.** Split the model-facing concerns out of `lib/openai.ts`:
- `lib/llm-client.ts` (new) decides which model and effort each call site uses. Each site gets its own env var, and unset means today's behaviour. It also holds `getModel(name, effort?)`, which passes effort as `modelKwargs.reasoning_effort`; `invokeStructured()`, the single structured-output call path; and the corrected `MODEL_PRICING`.
- `lib/llm-prompts.ts` (new) holds the three prompts and their Zod schemas, moved without changes, behind request builders that return `{ schema, messages }`.
- `lib/openai.ts` keeps the pipelines (batching, geocoding, usage tracking) and calls the two modules above.

After this, production and the eval harness send byte-identical prompts through the same call path.

**B — police re-send fix, in its own commit.** Add `safety_reports.geo_attempted boolean NOT NULL DEFAULT false`. When a successful LLM pass leaves a report without coordinates, the report is marked and never sent again.

**C — eval harness** in `packages/server/src/scripts/model-eval/`, run with `npm run eval:models`. It:
- reads the live public feeds, plus an optional SELECT-only top-up of police reports from the DB;
- runs each call site's arms through `invokeStructured` using the app's request builders, and scores them;
- decides the two extraction sites automatically;
- builds briefing inputs from the winning filter arm and runs the briefing arms;
- writes `results.md`, `rating-sets.json` and `rating-key.json`.

**Alternatives considered**
- *Minimal scope.* Keep everything in `openai.ts`, give the three production functions a `{ model, effort }` override parameter, and have the eval call them. Rejected for two reasons. Those functions swallow batch failures and geocode inside the timed section, so the eval could not measure per-call latency, parse failures or item coverage. And the production API would grow parameters that only the eval uses.
- *Export the pieces from `openai.ts` without splitting it.* This works, but it would push a file that already mixes prompts, pipelines, geocoding and usage accounting to about 17 exports. The split only separates model selection, prompt content and the pipelines, which is where this task adds weight. Usage tracking and geocoding stay where they are.
- *Police marker variants.* A timestamp that would allow retries later, or an in-memory set that needs no migration. See Decisions.

**Note on the relayed owner request.** The remarks about the top tier staying on gpt-5.2 and the 10th article of a batch being dropped are about *actually-relevant* (its `formatArticlesBlock`), not this repo. city-monitor has no gpt-5.2 call site. Its own 10-item batching was checked and does not have that off-by-one: indices are 0-based (0–9) and the remap is correct. The related risk here is different. A new model that numbers items from 1 would shift every verdict in a batch onto the neighbouring item, and push the last one onto the first item of the next batch. Assessments persist per item hash, so that damage would stay. The police path has the same exposure without batches: `needsGeo[geo.index]` only checks that the index exists, and after fix B a shifted response would also mark the wrong reports as attempted, permanently. A guard that just drops out-of-range indices would reproduce the actually-relevant symptom (the 10th item silently lost) while still mis-assigning the other nine. So commit A adds `checkBatchIndices`, which **rejects the whole response** when any index is non-integer or outside `0..n-1`. The news batch then fails and is retried next run, as a failed batch is today. The police call returns `null`, so nothing is placed and nothing is marked. The eval reports missing, duplicate and out-of-range indices for each arm, and rule R1 turns a systematic shift into a failed candidate. Whether gpt-5.2 is worth keeping is a question for actually-relevant's plan; nothing in this repo runs gpt-5.2.

## Decisions

### DECISION: Pass reasoning effort through modelKwargs, never through LangChain's reasoning option
- **Affects**: model, dependencies
- **Chosen**: `getModel(name, effort)` builds `new ChatOpenAI({ model, modelKwargs: { reasoning_effort } })`. It never sets `reasoning`, `maxTokens`, `temperature` or `topP`. Structured output stays on the default `jsonSchema` method.
- **Alternatives**: `reasoning: { effort }` is silently dropped for `gpt-6-*` IDs by @langchain/openai 1.2.11. Upgrading LangChain to 1.5.x pulls in openai SDK 7 and reportedly has the same `isReasoningModel()` check.
- **Why**: On the installed version this is the only option that reaches the API for both gpt-5 and gpt-6 IDs. A unit test pins the request parameters, so a later "cleanup" cannot bring the silent drop back.

### DECISION: One model and effort setting per LLM call site, defaults unchanged
- **Affects**: model, operations
- **Chosen**: The briefing uses `OPENAI_MODEL` and `OPENAI_SUMMARY_EFFORT`. News classification uses `OPENAI_FILTER_MODEL` and `OPENAI_FILTER_EFFORT`. Police extraction uses `OPENAI_GEO_MODEL`, which falls back to `OPENAI_FILTER_MODEL`, and `OPENAI_GEO_EFFORT`. An unset effort sends no `reasoning_effort`, so the API default applies as it does today. The effort is validated against the model family: `minimal | low | medium | high` for `gpt-5`, `gpt-5-mini` and `gpt-5-nano` (with or without a date suffix); `none | low | medium | high | xhigh | max` for `gpt-5.<n>-*` and `gpt-6-*`. For any other model, any of those values passes. A value outside the family's set, such as `minimal` on gpt-6-luna or `none` on gpt-5-nano, is logged and ignored rather than sent, because the API would reject it with a 400 and the call site would fail on every run.
- **Alternatives**: A single effort shared by news and police would not work, because the eval may choose different efforts for them, and on fallback even different models. Hard-coding efforts would make every phase-2 change a deploy.
- **Why**: Phase 2 then consists of env changes in the Render dashboard, and rolling back is the same kind of change.

### DECISION: Mark police reports after one unsuccessful location pass instead of retrying
- **Affects**: architecture, operations
- **Chosen**: A boolean `safety_reports.geo_attempted`. It is set when the geolocation call succeeded but the report still has no coordinates: the LLM gave no label, left the report out, or the label did not geocode. Later runs skip marked reports. The flag is not set when the LLM call itself failed, and a response rejected by `checkBatchIndices` counts as a failed call.
- **Alternatives**: A `geo_attempted_at` timestamp with a retry window adds logic nobody needs yet. An in-memory set is lost on every restart and deploy. Storing the label without coordinates would change what the API returns.
- **Why**: This stops the re-send every 10 minutes. The cost: if a label failed only because the geocoder was briefly down, that report never gets a map pin. Reports drop out of the feed within days, and `geocode()` already caches such misses in-process today.

### DECISION: Automated pass rules decide the news and police models; the owner rates only the briefing
- **Affects**: model
- **Chosen**: A candidate replaces the gpt-5-nano baseline only if it meets all of these conditions:
   - zero API or parse failures;
   - no more missing items than the baseline, with a tolerance of 1% of items;
   - zero junk labels;
   - an on-map rate no more than max(3 points, one item) below the baseline;
   - news only: at least 90% relevance agreement and at most 10% importance flips across 0.5.

   The first passing candidate in cost order wins: Luna low, then medium, for news; Luna none, then low, for police. If no candidate passes, the same rules are run on gpt-5.6-luna.
- **Alternatives**: The verified recommendation was a hand review of every disagreement, but the owner approved automated decisions for these sites. Rating extraction output makes no sense because it is a matter of fact, not taste.
- **Why**: These sites have measurable proxies (map pins, agreement with today's output). The owner's time is kept for the briefing, where quality is a matter of taste.

### DECISION: The eval reads only public live data plus a SELECT-only police top-up
- **Affects**: operations, security
- **Chosen**: News and police samples come from the live RSS feeds. The harness only reads the DB when the police feed yields fewer than 100 reports and `DATABASE_URL` is set. In that case it tops up with a single SELECT of explicit columns (`hash, title, description, published_at` from `safety_reports` for `berlin`, newest first, limit 200) inside try/catch, and closes the connection. It does **not** use `loadSafetyReports`: that function runs `db.select()` over every schema column, so once commit B adds `geoAttempted` to `schema.ts` it would request `geo_attempted` from a database that has not been migrated (no deploy happens in phase 1) and fail. If the SELECT fails, the harness records "DB top-up failed" with the error class, not the message, and continues with the live sample. It never initialises the geocoder's DB cache and never calls a `db/writes` function. `geocode.ts`, `ingest-feeds.ts` and `summarize.ts` import `db/writes` statically, but they only write when given a DB handle, and the eval never gives them one. It changes no config.
- **Alternatives**: Using news_items and safety_reports from the DB as the main sample would couple the eval to what is probably the production database. Live feeds alone may give too few police reports for a 3-point threshold.
- **Why**: The eval stays read-only by construction and the police decision still gets a usable sample.

### DECISION: Split model selection and prompts out of openai.ts
- **Affects**: architecture
- **Chosen**: `lib/llm-client.ts` holds model and effort resolution, client construction, the structured call and pricing. `lib/llm-prompts.ts` holds the prompts, schemas and request builders. `lib/openai.ts` keeps the three pipelines and usage tracking.
- **Alternatives**: Keep everything in `openai.ts` and export the pieces the eval needs.
- **Why**: Model migrations, prompt tuning and pipeline changes each have their own reason to change. The eval also has to import the prompts and the call path without the pipelines' batching and geocoding.

## Changes

### Commit A — LLM plumbing (defaults unchanged)

| File | Change |
|------|--------|
| `packages/server/src/lib/llm-client.ts` (new) | Four things. `MODEL_PRICING` in USD per 1M tokens: gpt-5-nano 0.05/0.40, gpt-5-mini 0.25/2.00, gpt-6-luna 0.10/0.50, gpt-6-sol 2.00/10.00, gpt-5.6-luna 0.20/1.20 (eval fallback); `DEFAULT_PRICING` stays at $1/$4. `resolveSiteTarget(site)` reads env at call time, as the code does today, so `vi.stubEnv` still works. It uses a private `parseEffort(raw, model)` that checks the value against the model family's allowed set (see Decisions), logs a warning and returns `undefined` for anything outside it. `getModel(name, effort?)` sets `modelKwargs: { reasoning_effort }` only when an effort is given. A comment explains why `reasoning` must not be used and why `maxTokens`/`temperature`/`topP` are never set. `invokeStructured(target, request, { signal }?)` calls `getModel(...).withStructuredOutput(schema, { includeRaw: true }).invoke(messages, { signal })` and returns `{ parsed: T \| null, raw: AIMessage, inTok, outTok, ms }`; API errors propagate. A comment says never to switch to `method: 'functionCalling'`. |
| `packages/server/src/lib/llm-prompts.ts` (new) | Moves `LANGUAGE_NAMES`, the briefing prompt with its dynamic schema, `buildFilterPrompt` with `FilterResultSchema` and `VALID_CATEGORIES`, and the geo prompt with `GeoResultSchema` out of `openai.ts` unchanged. Each site's message list is wrapped in a builder. This is a **pure move**: prompt strings, truncation lengths (120, 300 and 150 characters) and numbering (1-based for the briefing, 0-based for filter and geo) stay unchanged. Verify with `git diff --color-moved`. |
| `packages/server/src/lib/openai.ts` | `summarizeHeadlines` uses `resolveSiteTarget('summary')`, `buildBriefingRequest` and `invokeStructured`. When `parsed === null` it logs and returns `null`, the same outcome as today's TypeError path, and its return value gains `model: string`. `filterAndGeolocateNews`/`classifyBatch` use `resolveSiteTarget('filter')` and `buildFilterRequest`; a null parse fails the batch, as today. New exported pure helper `checkBatchIndices(items, n)` returns `{ ok: true, items }` or `{ ok: false, reason }`. It fails when any index is non-integer or outside `0..n-1`, because that is the signature of a numbering shift and every other verdict in the response is then suspect. On a duplicate index it keeps the first occurrence and reports the count. In `filterAndGeolocateNews`, a batch that fails the check is logged and handled like a thrown batch today (no items, retried next run). Only after the check passes are indices shifted by `startIndex`. `geolocateReports` uses `resolveSiteTarget('geo')` and `buildGeoRequest`, and runs the same check over the whole response with `n = reports.length`; on failure it logs and returns `null`. The three log lines add `describeTarget(target)`. `getUsageStats` prices through `estimateCostUsd`. `getModel`, `MODEL_PRICING`, the prompts and the schemas leave this file. `LLM_BATCH_SIZE` becomes an export so the eval batches the same way. |
| `packages/server/src/cron/summarize.ts` | The DB write uses `result.model` instead of re-reading `process.env.OPENAI_MODEL \|\| 'gpt-5-mini'`, which removes the duplicated default. |
| `packages/server/src/lib/llm-client.test.ts` (new) | See Tests. |
| `packages/server/src/lib/openai.test.ts` | Adds `checkBatchIndices` tests. |
| `.context/server.md` | Env table: add rows for `OPENAI_SUMMARY_EFFORT`, `OPENAI_FILTER_EFFORT`, `OPENAI_GEO_MODEL` (default: `OPENAI_FILTER_MODEL`) and `OPENAI_GEO_EFFORT`. Default effort is unset, which means the API default. List valid values per model family and note that effort goes through `modelKwargs` and that max tokens, temperature and top_p are never set. Utility table: add rows for `llm-client.ts` and `llm-prompts.ts`. |
| `.context/news.md` | LLM Integration section: per-site model and effort config; replace the stale "$1.00/$4.00" line with a pointer to `MODEL_PRICING` in `llm-client.ts`; note that the prompts now live in `llm-prompts.ts`. |
| `.plans/2026-09-24_gpt6-migration-and-eval.md` | This plan. |

`llm-client.ts`. *Responsibility:* decide which OpenAI model and reasoning effort a call site uses, build the client, make one structured-output call, and price tokens. *Exports:* `resolveSiteTarget`, `getModel`, `invokeStructured`, `describeTarget` (returns `model@effort`, or `model@default` when no effort is set), `estimateCostUsd`, plus the types `ReasoningEffort`, `LlmSite` (`'summary' \| 'filter' \| 'geo'`) and `ModelTarget`.

`llm-prompts.ts`. *Responsibility:* what the model is asked: the three prompts, their Zod schemas and how items are formatted into the message. *Exports:* `buildBriefingRequest(cityName, items, langs)`, `buildFilterRequest(cityName, batchItems)`, `buildGeoRequest(cityName, reports)`, `VALID_CATEGORIES`, plus the type `LlmRequest<T>` (`{ schema, messages }`).

### Commit B — police re-send fix

| File | Change |
|------|--------|
| `packages/server/src/db/schema.ts` | Add `geoAttempted: boolean('geo_attempted').notNull().default(false)` to `safetyReports`. |
| `packages/server/drizzle/0006_safety_geo_attempted.sql`, `packages/server/drizzle/meta/0006_snapshot.json`, `packages/server/drizzle/meta/_journal.json` | Generate with `npm run db:generate -- --name safety_geo_attempted` from `packages/server`; `generate` does not connect to a database. The SQL must be exactly `ALTER TABLE "safety_reports" ADD COLUMN "geo_attempted" boolean DEFAULT false NOT NULL;`. If drizzle-kit emits anything more (schema drift), trim the SQL to that one statement and keep the generated snapshot. **Do not run `db:migrate` or `db:push`**: the `DATABASE_URL` in `.env` may point at production. Render's start command applies the migration on the next deploy. The change is additive and safe for the code that is currently running. Expect one local side effect: the dev server that is already running (`tsx watch`) reloads commit B, and if its DB lacks the column, its safety reads (`loadSafetyReports` selects every column) and writes log errors until that DB is migrated. Migrate it only if a check that prints nothing but yes or no confirms `DATABASE_URL` points at localhost; otherwise leave the errors. They are local only. |
| `packages/server/src/db/reads.ts` | Replace `loadSafetyCoords` with `loadSafetyGeoState(db, cityId, hashes)`, which returns `{ coords: Map<hash, { lat, lon, label? }>, attempted: Set<hash> }`. It is the same single SELECT, with `geo_attempted` added. |
| `packages/server/src/db/writes.ts` | `saveSafetyReports(db, cityId, reports, geoAttempted: ReadonlySet<string> = new Set())` writes `geo_attempted` for each row and updates it on conflict (`sql\`excluded.geo_attempted\``). The marker stays out of the shared `SafetyReport` type, so it never reaches the cache or the API. |
| `packages/server/src/cron/ingest-safety.ts` | In `ingestCitySafety`: load the geo state. `needsGeo` excludes reports that already have coordinates and reports marked as attempted. Start the attempted set from the stored hashes. After `geolocateReports` returns a non-null result, add every `needsGeo` report that still has no location. Pass the set to `saveSafetyReports`. If `geolocateReports` returns `null` or throws, mark nothing new. Without a DB, behaviour is unchanged. |
| `packages/server/src/db/reads.test.ts`, `packages/server/src/db/writes.test.ts`, `packages/server/src/cron/ingest-safety.test.ts` | See Tests. The existing ingest-safety tests switch their mock to `loadSafetyGeoState` and also mock `../db/writes.js`. |
| `.context/events-safety.md` | Add a short "Location extraction" paragraph: the LLM produces a label, the geocoder turns it into coordinates, coordinates carry over by hash, and `geo_attempted` stops re-sends. Update the DB Schema line, including the retention period on that line: 3 days in code, not 7. |
| `.context/data-layer.md` | Add `geoAttempted` to the `safetyReports` row. |

### Commit C — eval harness

| File | Change |
|------|--------|
| `packages/server/src/scripts/model-eval/run.ts` (new) | The CLI entry point. It parses the flags, loads or collects inputs and enforces the budget. It then runs the phases in order: news filter, police, briefing. For each phase it scores the arms, applies the decisions, writes the deliverable and appends to the spend log. It uses `createLogger('model-eval')` and never logs env values. |
| `packages/server/src/scripts/model-eval/inputs.ts` (new) | Collects live samples and builds the briefing inputs; see *Inputs*. |
| `packages/server/src/scripts/model-eval/arms.ts` (new) | Arm definitions, volume and assumed-token constants, `runArm`, geocoding of labels, and the cost estimate; see *Arms*. |
| `packages/server/src/scripts/model-eval/scoring.ts` (new) | Pure functions: metrics, briefing checks, automatic decisions and rating selection; see *Metrics* onward. |
| `packages/server/src/scripts/model-eval/deliverable.ts` (new) | Pure rendering of `results.md` and the rating files, plus a thin writer; see *Deliverable*. |
| `packages/server/src/scripts/model-eval/{inputs,scoring,deliverable}.test.ts` (new) | See Tests. |
| `packages/server/src/cron/summarize.ts` | Extract and export `selectBriefingItems(digestItems)` (importance > 0.5, first 25) from `summarizeCityNews`, which then uses it. No behaviour change. |
| `packages/server/src/cron/ingest-feeds.ts` | Extract the digest sort comparator in `ingestCityFeeds` (tier, then importance descending, then newest) as an exported `compareDigestOrder`. `ingestCityFeeds` uses it. No behaviour change. |
| `packages/server/package.json` | Add `"eval:models": "tsx --env-file-if-exists=.env src/scripts/model-eval/run.ts"`. |
| `.context/model-eval.md` (new) | What the harness compares, the command and flags, what it reads, what it never does (no DB writes, no geocoder DB cache, no config changes), what it writes, where the decision rules live (`scoring.ts`), and why to rerun it: GPT-6 IDs have no dated snapshot, so behaviour can drift under the same ID. |
| `CLAUDE.md` | A one-line pointer to `.context/model-eval.md` in the Context Files list. |

Module responsibilities and exports:
- `run.ts`: CLI orchestration and the budget guard. No exports.
- `inputs.ts`: fetch the live evaluation samples and build the briefing inputs. *Exports:* `collectInputs`, `buildBriefingInputs`, types `EvalInputs` and `BriefingInput`.
- `arms.ts`: which arms each call site tests and how to run them against the API and the geocoder. *Exports:* `ARMS`, `VOLUME`, `runArm`, `geocodeLabels`, `estimateRunCost`, types `Arm`, `SiteId` and `CallRecord`.
- `scoring.ts`: turn call records into metrics, decisions and the rated-arm choice. *Exports:* `scoreExtraction`, `decideExtraction`, `checkBriefing`, `scoreBriefingArms`, `selectRatingArms`.
- `deliverable.ts`: render and write the owner-facing files. *Exports:* `buildRatingSets`, `renderResults`, `writeDeliverable`.

## Eval harness design

### CLI and budget

`npm run eval:models --workspace=packages/server -- --out ../../DOCS/2026-09-24_gpt6-eval [--dry-run] [--reuse-inputs] [--budget-usd 5]`

- `--out` is required and resolved relative to `packages/server`.
- `--dry-run` collects inputs and prints sample sizes and the cost estimate. It makes no LLM calls.
- `--reuse-inputs` reads `<out>/data/inputs.json` instead of fetching, so a rerun compares arms on identical inputs.
- **Budget** (cap $5 for this project): before the first LLM call, the cumulative spend in `<out>/data/spend-log.json` plus this run's estimate must be at or below `--budget-usd`, or the harness exits with code 1. Before each arm the check is repeated with actual spend so far plus the remaining estimate. At the end, the harness appends `{ startedAt, estimateUsd, actualUsd, calls }`. Actual cost is the `usage_metadata` tokens priced with `estimateCostUsd`. The cached-input discount is ignored, so this slightly overstates cost.
- **Estimate for this run.** Worst case is about $1.40, using conservative token counts and assuming the fallback arms run. The expected actual is about $0.50. Almost all of it is the two Sol briefing arms, at roughly $0.40 each worst case.

### Inputs (`inputs.ts`)

- **City config.** Import `berlin` from `config/cities/berlin.js` directly. `getActiveCities()` and `getCityConfig()` depend on `ACTIVE_CITIES`, which the local `.env` may set differently.
- **API key.** If `isConfigured()` is false, exit with code 1 and the message "OPENAI_API_KEY not set", printing no env values.
- **News.** Fetch every Berlin feed from the city config with a 10 s timeout and the User-Agent `CityMonitor/1.0 (model-eval)`, and parse with `parseFeed`. Map items the same way `fetchOneFeed` does: id `hashString(url + title)`, `sourceName`, `tier`, `description`, `publishedAt`. Dedupe by id and order like production (tier, then newest). Keep the newest 300.
- **Police.** Fetch `dataSources.police.url` and map reports the way `ingestCitySafety` does. If there are fewer than 100 reports and `DATABASE_URL` is set, open `createDb()`, run the explicit-column SELECT from the read-only decision above (never `loadSafetyReports`), then `client.end()` in a `finally`. Merge by id, newest first, cap at 100, and record the count from each source.
- Save both samples to `<out>/data/inputs.json` with the fetch time.
- **`buildBriefingInputs(items, verdicts, now)`**
  - Windows end at `now`, `now − 4h`, `now − 8h`, and so on back to the oldest item. Each window takes the items published in the 24 h before its end.
  - Within a window, attach the winning filter arm's verdicts as `assessment`, sort with `compareDigestOrder`, then apply `applyDropLogic` and `selectBriefingItems`. This mirrors what production's summarize job sees.
  - Keep a window if it has at least 8 items and its top 10 share less than 70% of their titles with every window already kept. Stop at 6 windows.
  - Items without a parseable date only count for the `now` window.
  - With fewer than 3 inputs, the briefing phase stops with a clear message; extraction results are still written.
  - If the filter decision found no winner, use the baseline's verdicts.

### Arms (`arms.ts`)

| Site | Baseline (today) | Candidates, cheapest first | Fallback (only if no candidate passes) |
|---|---|---|---|
| News classification | gpt-5-nano@default | gpt-6-luna@low, gpt-6-luna@medium | gpt-5.6-luna@low, gpt-5.6-luna@medium |
| Police locations | gpt-5-nano@default | gpt-6-luna@none, gpt-6-luna@low | gpt-5.6-luna@none, gpt-5.6-luna@low |
| Briefing (de/en/tr/ar) | gpt-5-mini@default | gpt-6-luna@medium, gpt-6-luna@high, gpt-6-sol@low, gpt-6-sol@medium | none |

`@default` means no `reasoning_effort` is sent, which is what production does today.
- Requests are built only with the app's builders:
  - `buildFilterRequest`, in batches of `LLM_BATCH_SIZE` in production order;
  - `buildGeoRequest`, in chunks of 10 reports. Production sends every report that needs a location in a single call, with no batching. After fix B that is usually only the few new reports of a run, so 10 per call is a stand-in for a normal run. The one-off backlog call right after deploy is not modelled. results.md states this;
  - `buildBriefingRequest`, with Berlin's `languages`.

  All of them are sent with `invokeStructured` and a 180 s `AbortSignal.timeout`.
- **Per arm**, the first call runs alone. If it returns an API error, the arm is marked unusable, the message is recorded and the arm's remaining calls are skipped. After that, calls run 4 at a time.
- **Call records.** Each call produces `CallRecord { site, arm, requestId, inputIds, ms, inTok, outTok, reasoningTok, costUsd, finishReason, error?: 'api' | 'refusal' | 'truncated' | 'parse', errorMessage?, parsed? }`, which is appended to `<out>/data/calls.jsonl`. When `parsed` is null, the error is classified from the raw message: empty content means `refusal` (LangChain 1.2.11 hides the refusal text on Chat Completions, see the facts at the top), `finish_reason: 'length'` means `truncated`, and anything else means `parse`. `invokeStructured` returns `raw` alongside `parsed` so the eval can do this; production ignores it.
- **Geocoding** runs after all LLM calls for a site. Unique labels, after `stripBareCityLabel`, go through `geocode()` one at a time: Nominatim at 1 request per second, with LocationIQ as fallback if configured. The in-process cache dedupes labels across arms. A label counts as **on map** if its result falls inside `city.boundingBox`, which is what the frontend displays. `initGeocodeDb` is never called. `geocode()` caches a Nominatim HTTP error (for example a 429) as a permanent miss, the same as "not found". So after the first pass, clear the cache with `clearGeocodeCache()` and retry each null label once, so that a transient provider error is not scored as the arm's miss. Expect roughly 1.1 s per unique label: about 10 to 20 minutes of geocoding for the whole run. Run the real eval in the background.
- **`VOLUME`** (monthly calls, with sources in comments):
  - news: 3,750 (inventory: 3k–4.5k). Eval batches are full while production averages about 2.5 items per call, so the monthly figure is labelled an upper bound.
  - police: 4,320 (one call per 10-minute run before fix B; lower after it).
  - briefing: 120.
- **Assumed tokens for the estimate**, deliberately high:
  - news: 2.5k in / 3k out per call
  - police: 1.5k in / 2k out
  - briefing: 2k in / 6k out

### Metrics (`scoring.ts`, pure)

**News and police, per arm** (n = number of sample items):
- **Reliability:** API errors, refusals, truncated and unparseable responses (each counted separately), responses that `checkBatchIndices` would reject, and items that are missing or have a duplicate or out-of-range index.
- **Invalid values (news only):** a category outside `VALID_CATEGORIES`, or an importance outside 0–1. These are counted before normalising; the harness then normalises them the same way production does.
- **Junk labels:** labels with control characters, U+FFFD, letters outside the Latin script, stray markup (`<|`, a literal `\u`), or more than 80 characters.
- **Location rates:** label rate, geocoded rate and on-map rate, all over n.
- **Against the baseline**, over items both arms returned: relevance agreement; category agreement where both said relevant; importance flips across 0.5, which is the threshold for briefing input (news); and the same-label rate (both sites).
- **Latency and cost:** p50 and p95 latency (nearest rank), mean tokens in and out per call, mean $ per call, and $ per month = $ per call × `VOLUME`.

**Briefing, per output language.** Hard checks:
- **Present:** not empty and not `-`.
- **Right language:**
  - `ar`: at least 60% of the letters are Arabic script.
  - `tr`: at least 2 Turkish-only letters from ç ğ ı ş İ, and Turkish stop-words outnumber German and English ones.
  - `de` and `en`: their own stop-words outnumber the other languages'.
- **No Markdown:** no line starting with `-`, `*`, `•`, `+`, `1.`, `1)`, `#` or `>`, no `**`, no `|` tables.
- **Length in words:** 72–180 for de and en, 54–180 for tr and ar. The target is about 120, and Turkish and Arabic use fewer, longer words.

Soft signals are reported and used only for ranking:
- exactly two paragraphs;
- numbers in the de or en text that do not appear in the input headlines, a cheap signal for invented facts;
- junk characters.

### Automatic decisions (news and police)

Candidate C is compared with baseline B.
- **R1:** 0 API errors, 0 refusals, truncated or unparseable responses, 0 responses that `checkBatchIndices` rejects (production would discard them), and missing or invalid-index items ≤ max(B's count, 1% of n).
- **R2:** 0 junk labels. For news, also no more invalid category or importance values than B.
- **R3:** on-map rate(C) ≥ on-map rate(B) − max(3 points, 100/n points).
- **R4 (news only):** relevance agreement with B ≥ 90%.
- **R5 (news only):** importance flips across 0.5 ≤ 10% of the items both returned.

The winner is the first candidate in the table order that passes every rule. If none passes, the fallback arms run and the same rules apply. If none of those passes either, there is no winner: results.md says so plainly and recommends keeping the baseline until someone reviews it. For every candidate, results.md shows which rules passed and which failed, with the numbers.

### Rating selection (briefing only; the owner's budget is 6 items)

- An arm is *eligible* for an item (one input in one language) when that language passes all hard checks.
- **Arm ranking**, used across all items:
  1. share of inputs on which all four languages pass the hard checks;
  2. soft signals;
  3. lower cost.
- **Each item shows three options**: the baseline, the best-ranked Luna arm and the best-ranked Sol arm. If a pick is not eligible, it is replaced by the next eligible arm of the same model, or failing that by the next eligible arm overall. Items with fewer than 2 eligible arms are skipped.
- **Rated items**: the first 3 briefing inputs, newest first, that have at least 2 eligible arms in both German and English. That gives 3 German and 3 English items, 6 in total.
- **Why this instead of the 3 highest-ranked arms overall:** the top three could be three efforts of the same model, and the rating would then say nothing about whether Luna is good enough or whether GPT-6 matches today's quality. The phase-2 choice (Luna, Sol, or neither) needs exactly the baseline, Luna and Sol side by side.

### Deliverable (`deliverable.ts`)

Everything goes into `<out>` = `D:/projects/city-monitor/DOCS/2026-09-24_gpt6-eval/`. The folder is gitignored and is never committed.

**`rating-sets.json`** has exactly this shape: `{"project":"city-monitor","sets":[...]}`.
- **Sets:**
  - `city-monitor-briefing-de`, titled "Berlin daily news briefing (German)";
  - `city-monitor-briefing-en`, titled "Berlin daily news briefing (English)".
- **Instructions**: "Each option is a daily news briefing written from the headlines shown. Pick the one you would rather publish: accurate to the headlines with nothing invented, covering what matters most for Berlin, and reading naturally in German." The English set uses the same text with "English".
- **Item ids** run from `<set id>-01` to `-03`.
- **`context_md`** is "Headlines given to the writer (Berlin, up to <window end in Europe/Berlin time>):" followed by the exact numbered list the model received.
- **Options** are `{ "label", "type": "text", "content_md" }`, with the briefing text verbatim.
- **Option order**: shuffle with Fisher–Yates using a PRNG seeded from sha256(item id). The order is deterministic and differs between items. Labels A, B and C are assigned after the shuffle.
- **No model names** appear in the file. Before writing, the serialised JSON is checked (case-insensitive) for every arm's model ID, for `gpt-<digit>` and for `openai`. Any hit in ids, titles, instructions or labels aborts the write. A hit inside an item's `content_md` or `context_md` aborts it too, unless the same string occurs in that item's input headlines. GPT-6 launched two days ago, so a Berlin headline about OpenAI is possible, and it must not block the deliverable.

**`rating-key.json`**: `{ "<item id>": { "A": "gpt-6-sol@low", "B": "gpt-5-mini@default", ... } }`.

**No `images/` folder**, because this project has no image call site.

**`results.md`** is written in plain language, with these sections:
1. **What was tested and why**, in two or three sentences.
2. **Bottom line**, one row per call site: the decision (winner and effort, or "awaits your rating"), monthly cost today against monthly cost for the winner, and total API spend for the eval (cumulative across runs).
3. **News classification**: a table with one row per arm and columns for calls, API errors, refusals, truncated and unparseable responses, rejected batches, missing items, invalid values, junk labels, relevance agreement, category agreement, importance flips, label, geocoded and on-map rates, p50/p95 latency, tokens in/out per call, $ per call and $ per month. Then which rules each candidate passed or failed, and the winner.
4. **Police locations**: the same, without the relevance, category and flip columns.
5. **Daily briefing**:
   - a table with one row per arm: pass rate per hard check and per language, soft signals, latency, tokens and cost;
   - which arms go to the owner, and why;
   - a **Turkish and Arabic back-translation** table (arm × input: verdict and one line of evidence), which the person running the eval fills in;
   - the phase-2 rule (below).
6. **Samples and method**: sources, sizes and fetch time, whether the DB top-up was used, volume assumptions with sources, and the pricing table.
7. **Spend**: this run's estimate against actual, the cumulative total, and the $5 cap.

**`data/`** holds working files:
- `inputs.json`;
- `calls.jsonl`;
- `briefings.json`, with every arm's four languages for every input;
- `tr-ar-review.md`: for each input, the headlines, then each arm's English, Turkish and Arabic text side by side;
- `spend-log.json`.

**Phase-2 briefing rule**, written into results.md: choose the cheapest GPT-6 arm that meets all three conditions below, checking Luna before Sol and lower effort first. If no arm does, escalate; gpt-5.6-terra has not been tested.
1. It passes the hard checks at least as often as the baseline.
2. It passes the Turkish and Arabic back-translation on every reviewed input.
3. The owner rates it at least as well as the baseline.

## Running the eval (later step, not part of the three commits)

1. **Confirm production models.** Check that production still runs today's models: GET the public `/api/health` and look at the `ai` keys (`gpt-5-nano:berlin`, `gpt-5-mini:berlin`). This is read-only. If the keys differ, note it in results.md.
2. **Dry run.** `npm run eval:models --workspace=packages/server -- --out ../../DOCS/2026-09-24_gpt6-eval --dry-run`. Record the estimate.
3. **Real run.** Run the same command without `--dry-run`, but only if cumulative spend plus the estimate is at or below $5. If the first call of every GPT-6 arm fails (for example, json_schema is rejected at effort above `none`), stop and record it. Do not improvise a Responses API path.
4. **Back-translation.** Open `data/tr-ar-review.md`. Review the 3 rated inputs, for every arm whose Turkish and Arabic pass the hard checks: at most 5 arms × 3 inputs × 2 languages = 30 texts. For each one, back-translate the Turkish and Arabic briefings and compare them with the same arm's English briefing and with the headlines. Look for added or dropped facts, wrong language or script, broken or unnatural sentences, and mangled names. Fill in the results.md table: pass, minor issues or fail, with one line of evidence each.
5. **Check `rating-sets.json`.** It should have at most 6 items, 2–4 options per item, and the exact shape above.

## Tests

Follow the existing pattern: Vitest, files next to the code, explicit assertions, no network. Run `npm run typecheck`, `npm run lint` and `npm test` before each commit, and do not commit if any of them fails.

**`llm-client.test.ts`**
- **Defaults** with no env set: summary is gpt-5-mini, filter and geo are gpt-5-nano, and none of them has an effort.
- **Geo model fallback:** geo uses `OPENAI_FILTER_MODEL` when `OPENAI_GEO_MODEL` is unset and uses `OPENAI_GEO_MODEL` when it is set.
- **Effort values:** a valid effort passes through; `''` and unknown values give `undefined`; `minimal` on `gpt-6-luna` and `none` or `xhigh` on `gpt-5-nano` give `undefined`; `none` on `gpt-6-luna` and on `gpt-5.6-luna` passes.
- **Request parameters** (stub `OPENAI_API_KEY`):
  - `getModel('gpt-6-luna', 'low').invocationParams({})` has `reasoning_effort: 'low'`, and `max_tokens`, `max_completion_tokens`, `temperature` and `top_p` are all undefined.
  - `getModel('gpt-5-nano')` has no `reasoning_effort`, so the request is unchanged from today.
- **Pricing:** `estimateCostUsd` uses the table for known models and `DEFAULT_PRICING` for unknown ones.

**`openai.test.ts`**
- `checkBatchIndices` accepts indices 0–9 for n = 10. It rejects the whole response for a 1-based response (1–10), for a negative index and for a non-integer index. On a duplicate it keeps the first occurrence and reports the count.
- `geolocateReports` returns `null` when the (mocked) model response is numbered from 1. Mock `invokeStructured`, not the network.

**`reads.test.ts`**
- `loadSafetyGeoState` puts rows with coordinates in `coords`, rows with `geo_attempted` and no coordinates in `attempted`, and rows with neither in neither.

**`writes.test.ts`**
- `saveSafetyReports` writes `geoAttempted: true` only for hashes in the set.
- It still upserts once when no set is given.

**`ingest-safety.test.ts`**
- Reports marked as attempted are not sent to `geolocateReports`.
- After a successful call, reports that got no location are passed to `saveSafetyReports` in the attempted set.
- Nothing new is marked when `geolocateReports` returns `null`.
- Previously attempted hashes are carried forward.

**`model-eval/inputs.test.ts`**
- `buildBriefingInputs` drops windows with fewer than 8 items.
- It drops a window whose top 10 is too similar to a window already kept.
- It stops at 6 windows.
- It places undated items only in the `now` window.
- It orders items with `compareDigestOrder`, then `applyDropLogic`, then `selectBriefingItems`.

**`model-eval/scoring.test.ts`**
- **Junk scan:** flags a control character, U+FFFD, Cyrillic text and an 81-character label; does not flag umlauts, ß or hyphenated street names.
- **Coverage:** counts missing, duplicate and out-of-range indices, and counts a 1-based batch as rejected.
- **Error classification:** empty content gives `refusal`, `finish_reason: 'length'` gives `truncated`, and malformed content gives `parse`.
- **Agreement:** counts relevance agreement and importance flips across 0.5.
- **Language check:** passes fixtures in the right language; fails English text in the `tr` slot, German text in the `tr` slot and Latin text in the `ar` slot.
- **Markdown detection:** flags bullets, numbered lists, headings and `**`; does not flag hyphenated words or an en dash in mid-sentence.
- **Length bounds.**
- **`decideExtraction`:**
  - the first passing candidate wins, even when a later one is better;
  - an on-map rate 3.1 points below baseline is rejected;
  - the tolerance for n = 20 is one item;
  - if nothing passes, there is no winner.
- **`selectRatingArms`:**
  - picks baseline, best Luna and best Sol;
  - replaces an ineligible pick within the same model first;
  - drops to 2 options when only 2 arms are eligible;
  - skips an input with fewer than 2 eligible arms in de or en.

**`model-eval/deliverable.test.ts`**
- **Shuffle:** the same item id always gives the same order and a permutation of the arms, and the baseline does not get the same label across all six item ids.
- **Leak guard:** `buildRatingSets` throws when an option's content contains an arm's model ID. It does not throw when "OpenAI" appears in the content and also in that item's headlines.
- **Key:** `rating-key.json` maps each label back to the arm that produced that option.
- **Shape:** every item has 2–4 options and ids follow `<set id>-NN`.

No tests are planned for the moved prompt text, the pricing figures, `VOLUME` or the docs, because they are static content.

## Commits

Each commit is staged with `git add <explicit paths>` and made with `git commit -m "..." -- <the same paths>`. Each message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Rules for every commit:
- never `git add -A` or `git commit -a`;
- never anything under `DOCS/`;
- never push, deploy or touch Render settings.

The committed `.gitignore` does **not** contain `DOCS/`. The `DOCS/` line in the working tree is an uncommitted change from another run. Leave it as it is, or add `.gitignore` to commit A's pathspec, but never revert it. Before each commit, check with `git status --short` that nothing under `DOCS/` is staged.

1. **A: "LLM plumbing: per-site model and effort, corrected pricing, shared request builders".** Paths: `packages/server/src/lib/llm-client.ts`, `packages/server/src/lib/llm-client.test.ts`, `packages/server/src/lib/llm-prompts.ts`, `packages/server/src/lib/openai.ts`, `packages/server/src/lib/openai.test.ts`, `packages/server/src/cron/summarize.ts`, `.context/server.md`, `.context/news.md`, `.plans/2026-09-24_gpt6-migration-and-eval.md`.
2. **B: "Stop re-sending unlocatable police reports to the LLM".** Paths: `packages/server/src/db/schema.ts`, the three `packages/server/drizzle/` files, `packages/server/src/db/reads.ts`, `packages/server/src/db/reads.test.ts`, `packages/server/src/db/writes.ts`, `packages/server/src/db/writes.test.ts`, `packages/server/src/cron/ingest-safety.ts`, `packages/server/src/cron/ingest-safety.test.ts`, `.context/events-safety.md`, `.context/data-layer.md`.
3. **C: "Add model evaluation harness for the GPT-6 migration".** Paths: `packages/server/src/scripts/model-eval/` (8 files), `packages/server/src/cron/summarize.ts`, `packages/server/src/cron/ingest-feeds.ts`, `packages/server/package.json`, `.context/model-eval.md`, `CLAUDE.md`.

## Out of Scope

- Changing default models or efforts, `render.yaml`, or Render env vars. That is phase 2, after the ratings.
- Restoring effort `low` for the briefing, which was lost in dd3a15b. It becomes a phase-2 choice through `OPENAI_SUMMARY_EFFORT`.
- A LangChain upgrade, the Responses API, and testing gpt-5.6-terra.
- `ai_summaries` repeating the whole call's token counts on every language row (about 4× overcount), the public AI cost counters in `/api/health`, and a persistent cost ledger.
- Doc drift outside the sections touched here: "10 Berlin feeds" in CLAUDE.md, and the "top 5 headlines" hash in news.md.
- Cache-only mode (no `DATABASE_URL`), which keeps re-sending police reports as it does today.
- Hamburg, which is not active in production.
- actually-relevant's gpt-5.2 top tier and its `formatArticlesBlock` off-by-one. They belong to that repo's plan.

**Named debt.** After the split, `openai.ts` still mixes the three pipelines, geocoding post-processing and usage accounting. That is acceptable with three call sites. If a fourth appears, move usage tracking into its own module.
