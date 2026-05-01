# External data-source check scripts (start with weather)

- **Date**: 2026-05-01
- **Status**: completed
- **Type**: feature

## Problem

Production weather has been stuck at 2026-04-26T15:30Z for 5 days. The cron `lastFailure: null` reports success. Two latent bugs in `packages/server/src/cron/ingest-weather.ts` make external failures invisible:

1. The per-city `try/catch` on lines 51-56 catches errors and only logs them — the scheduler's outer try/catch never sees an error, so `lastFailure` stays null even when every city's fetch times out (the actual current state — confirmed via the production log line `[ingest-weather] ERROR: berlin failed ... TimeoutError`).
2. Lines 76 and 148 do `if (!response.ok) return;` — a non-2xx response writes nothing, throws nothing, logs nothing, and the cron exits "successfully."

Separately, we have no opt-in way to probe an external source from a dev machine when production goes silently stale. Today we have to read code, hand-paste URLs into curl, and eyeball the response. The user wants a script that does this end-to-end for every weather source — runnable on demand, never part of the auto test run.

## Approach

Two coupled changes in one plan because the bugfix and the check script solve the same observability gap.

**Bugfix + cadence change in the existing weather cron:**
- Change `if (!response.ok) return;` (lines 76, 148) to throw an `Error` whose message includes the URL, status, and a body snippet. This makes the next 4xx visible in production logs.
- Replace the loop's per-city `try/catch` with one that records each city's error, logs it per-city, and after all cities have been attempted re-throws an aggregated error if **any** city failed. Hamburg still runs when Berlin fails (so we don't lose a working result to a broken one), but the scheduler now sees the failure and sets `lastFailure` on the very first regression — per user decision; matches the principle that `lastFailure: null` should mean "fully healthy", not "at least one city worked."
- Drop ingest cadence from every 30 min to hourly. User hypothesis: Render → `api.open-meteo.com` may be soft-rate-limited, and the public free tier is generous enough that hourly is plenty for a forecast that updates a few times per day.
  - `app.ts:170`: `'*/30 * * * *'` → `'0 * * * *'`.
  - `app.ts:110`: startup freshness `maxAgeSeconds: 1800` → `3600` so a still-fresh-for-this-cadence value doesn't trigger an unnecessary startup re-ingest.
  - `ingest-weather.ts:97` and `:169`: cache TTL `1800` → `3600` so the in-memory cache doesn't expire mid-cycle and force the route to fall back to Postgres for 30 min after each cycle. Matches the new ingest cadence.

**New check script `packages/server/src/scripts/check-weather-sources.ts`:**
- Plain `tsx` script (matches existing `invalidate-cache.ts` / `data-retention.ts` convention).
- Probes all four weather data sources for one configurable city (default: Berlin):
  - Open-Meteo forecast (full URL with the same params as the cron)
  - Open-Meteo air-quality
  - DWD warnings
  - DWD UV
- For each: measures latency, validates HTTP status, parses JSON, and asserts the response contains the fields the ingestion code reads (e.g. `current.temperature_2m`, `hourly.time` array, DWD JSONP wrapper).
- Prints a one-row-per-source summary. Exits 0 if all pass, 1 if any fails.
- Hooks: `npm run check:weather` from `packages/server`.

Vitest discovers tests by `**/*.{test,spec}.?(c|m)[jt]s?(x)` by default. The script lives outside that pattern, so `turbo run test` and `vitest` will not pick it up.

**Alternatives considered:**
- *Use Vitest with an `--run` tag or separate config.* Rejected: tests would still appear under `vitest list` and risk being included by future CI changes; the tsx-script-with-npm-alias pattern is already used twice in this repo.
- *Reuse the cron's URL builder via a shared helper.* Rejected: would require carving a helper out of `ingest-weather.ts` for one extra caller. Duplicating ~5 lines of URL construction is cheaper than adding the abstraction (YAGNI).
- *Build a generic "probe all data sources" framework now.* Rejected: out of scope — the user explicitly asked to start with weather, and 23 cron jobs would each need bespoke shape validation. A second script (`check-news-sources.ts`) can be added when needed; that's the time to consider extracting common helpers.

## Changes

| File | Change |
|------|--------|
| `packages/server/src/cron/ingest-weather.ts` | Throw on `!response.ok` (forecast + air-quality) with status + URL + body snippet; collect per-city failures in the loop and rethrow if **any** city failed so scheduler tracks `lastFailure`. Bump cache TTLs (line 97 weather, line 169 air-quality) `1800 → 3600` to match new hourly cadence. |
| `packages/server/src/app.ts` | Change ingest-weather schedule `'*/30 * * * *'` → `'0 * * * *'` (line 170). Bump startup freshness `maxAgeSeconds` for `ingest-weather` `1800` → `3600` (line 110). |
| `packages/server/src/cron/ingest-weather.test.ts` | New file. Two tests: (a) `createWeatherIngestion` throws when any city fetch fails (with a second city succeeding, to prove single-city failure trips the alarm); (b) ingestion throws when Open-Meteo returns a non-2xx response. Use `vi.stubGlobal('fetch', ...)`. |
| `packages/server/src/scripts/check-weather-sources.ts` | New script. Probes Open-Meteo forecast, Open-Meteo air-quality, DWD warnings, DWD UV. Prints a status table. Exits non-zero on any failure. Accepts `--city <id>` (default `berlin`). |
| `packages/server/package.json` | Add `"check:weather": "tsx --env-file-if-exists=.env src/scripts/check-weather-sources.ts"`. |
| `.context/weather.md` | Add a one-line note pointing at the new script under a "Diagnostics" subheading. |

## Tests

Two logic-bearing tests in `packages/server/src/cron/ingest-weather.test.ts`:

1. **Single-city failure propagates** — configure two active cities, stub `fetch` so Berlin times out and Hamburg succeeds; assert the function returned by `createWeatherIngestion()` rejects (any-city-failed semantics) and that Hamburg's success still wrote to cache. This guards the scheduler's `lastFailure` behavior.
2. **Non-OK response throws** — stub `fetch` to return `{ ok: false, status: 400, text: () => Promise.resolve('bad request') }`; assert the function rejects with an error message containing `400`. This guards against silent regressions on the `!response.ok` path.

Both use the existing Vitest server config (Node env, no DOM).

No tests for the check script itself — it IS the test, and the whole point is that it hits the real internet on demand.

No tests for `check-weather-sources.ts` URL strings or output formatting — that is static content per the plan-skill guidance.

## Out of Scope

- Fixing the same silent-return / per-city-catch pattern in the other 23 cron jobs.
- Building check scripts for any non-weather source (news RSS, transport.rest, kulturdaten, police RSS, etc.).
- Investigating *why* Render → `api.open-meteo.com` is timing out (network-layer issue, possibly IP block or transient routing). The fix here makes the failure visible; a network-side fix is a separate task once we see the error class persist.
- Redesigning the cache freshness model so the route refuses to serve stale data.
- Frontend changes (the "updated 4 days ago" badge already exists and is doing its job correctly).
- Extracting a shared URL-builder helper between cron and script.
