# Parallelize Server Startup

## Problem

The server startup has two sequential bottlenecks:

1. **`warmCache`** — runs ~12 Postgres reads per city, one after another, for each city in sequence. With 2 cities and 12 reads each, that's ~24 serial DB queries.
2. **`createScheduler` runOnStart** — runs all 11 startup cron jobs sequentially in a fire-and-forget IIFE. Only `summarize-news` truly depends on `ingest-feeds`; the other 9 jobs are independent.

## Changes

### 1. `warm-cache.ts` — Parallelize per-city reads

Refactor `warmCache` to use `Promise.allSettled` for the independent reads within each city, and run cities in parallel too.

**Before:** 24 sequential awaits (2 cities x 12 reads)
**After:** 1 geocode await + 1 `Promise.allSettled` across all cities, each city internally using `Promise.allSettled` for its ~9 read groups

Each read already has its own try/catch, so `Promise.allSettled` preserves the existing fault-isolation behavior — a failure in one read doesn't abort others.

The political reads (4 levels) will be grouped into a single `Promise.allSettled` as well, rather than a sequential loop.

### 2. `scheduler.ts` — Parallel startup with dependency support

Add a `dependsOn` field to `ScheduledJob`. Jobs without dependencies (or whose dependencies have completed) run in parallel. The startup IIFE becomes:

1. Separate jobs into: `ingest-feeds` (runs first), `summarize-news` (depends on feeds), and everything else (independent).
2. Run `ingest-feeds` + all independent jobs in parallel via `Promise.allSettled`.
3. After `ingest-feeds` resolves, run `summarize-news`.

This is a simple two-phase approach: no complex DAG resolution needed since there's only one dependency edge.

### Files changed

| File | Change |
|---|---|
| `packages/server/src/db/warm-cache.ts` | `Promise.allSettled` for per-city reads and across cities |
| `packages/server/src/lib/scheduler.ts` | `dependsOn` field on `ScheduledJob`, two-phase parallel startup |
| `packages/server/src/app.ts` | Add `dependsOn: ['ingest-feeds']` to `summarize-news` job |
| `packages/server/src/db/warm-cache.test.ts` | Verify parallel execution still populates cache correctly |
| `packages/server/src/lib/scheduler.test.ts` | Test parallel startup + dependency ordering |
