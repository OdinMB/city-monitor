# Model Eval Harness

`packages/server/src/scripts/model-eval/` compares LLM models and reasoning efforts for the three call sites on live Berlin data. It was built for the GPT-6 migration (the gpt-5-nano / gpt-5-mini snapshots shut down 2026-12-11) and is meant to be rerun: GPT-6 IDs have no dated snapshot, so behaviour can drift under the same model ID.

## What it compares

| Site | Baseline (production today) | Candidates, cheapest first | Fallback (only if no candidate passes) |
|---|---|---|---|
| News classification | gpt-5-nano@default | gpt-6-luna@low, @medium | gpt-5.6-luna@low, @medium |
| Police locations | gpt-5-nano@default | gpt-6-luna@none, @low | gpt-5.6-luna@none, @low |
| Briefing (de/en/tr/ar) | gpt-5-mini@default | gpt-6-luna@medium, @high, gpt-6-sol@low, @medium | — |

Arms live in `arms.ts` (`ARMS`). `@default` = no `reasoning_effort` sent. Every request is built by the production builders in `lib/llm-prompts.ts` and sent through `invokeStructured` in `lib/llm-client.ts`, so the eval measures exactly what production would send.

## Running it

```bash
npm run eval:models --workspace=packages/server -- --out ../../DOCS/<date>_<name> [--dry-run] [--reuse-inputs] [--budget-usd 5] [--smoke]
```

- `--out` is resolved relative to `packages/server`. Keep it under the gitignored `DOCS/`.
- `--dry-run`: fetch inputs, print sample sizes and the worst-case cost estimate; no LLM calls.
- `--reuse-inputs`: reuse `<out>/data/inputs.json` so a rerun compares arms on identical inputs.
- `--budget-usd`: the run refuses to start if cumulative spend (`<out>/data/spend-log.json`) plus the worst-case estimate exceeds it, and re-checks before every arm with actual spend.
- `--smoke`: 10 news items, 10 police reports, one briefing input, no fallbacks, briefing only baseline + first Luna + first Sol; writes to `<out>/smoke/` but books its spend in the same spend log. About $0.01 actual.
- A full run takes 10–20 minutes, mostly geocoding (Nominatim, 1 req/s) — run it in the background.

## What it reads, and what it never does

- Reads the live public feeds (Berlin news feeds, police RSS). The police RSS carries only ~10 releases, so the harness fills up to 100 from the berlin.de press-release archive (`/polizei/polizeimeldungen/archiv/<year>/`, 50 per list page): it reads each release page and takes the first `textile` block, the text the RSS description is cut from. One request at a time, 250 ms apart, one retry after 2 s (berlin.de resets about one connection in six).
- If feed plus archive still yield fewer than 100 reports and `DATABASE_URL` is set, it tops up with one SELECT of explicit columns from `safety_reports` — never `loadSafetyReports`, which selects every schema column and breaks against an unmigrated DB. A failed top-up logs the error class and driver code only.
- Never writes to a database, never calls a `db/writes` function, never initialises the geocoder's DB cache (`initGeocodeDb`), never changes config or env.
- `geocode()` caches a provider HTTP error as a permanent miss; the harness clears that cache and retries misses once so a transient 429 is not scored against an arm.

## What it writes (`<out>/`)

- `results.md` — per-site tables, which rules each candidate passed, the winners, the rated briefing arms, a Turkish/Arabic back-translation table for the operator to fill in, and spend.
- `rating-sets.json` + `rating-key.json` — blind rating of German and English briefings (≤ 3 items per language; baseline, best Luna, best Sol per item). Option order is balanced across the file — every ordering used equally often, in a seeded sequence — because a hash per item alone put the same order on 5 of 6 items in a real run. A leak guard refuses to write if a model name appears anywhere except inside an item whose own headlines contain the same string.
- `data/` — `inputs.json`, `calls.jsonl` (every call record incl. parsed output), `briefings.json`, `tr-ar-review.md`, `spend-log.json` (cumulative across runs).

## Where the rules live

- `extraction-scoring.ts` — metrics and the automatic decision rules R1–R5 for news and police (first passing candidate in cost order wins). For police, a report left out of an accepted response is scored as "no location", not as a defect: GPT-6 Luna answers the prompt's "omit the locationLabel field" by leaving the item out, and production marks it attempted exactly like a null. A news item left out stays a defect (production re-sends it). The news table also shows "Briefing-eligible" (relevant and importance > 0.5, the summarize job's cut-off).
- `briefing-scoring.ts` — hard checks (present, right language, no Markdown, length), soft signals, arm ranking, rating selection.
- `call-stats.ts` — failure classification (refusal = empty content, truncated = `finish_reason: length`, else unparseable; LangChain 1.2.11 hides the refusal text) and latency/token/cost stats.
- `inputs.ts` — live sampling and `buildBriefingInputs` (sliding 24h windows, 4h apart, ordered and cut exactly as the summarize job does via `compareDigestOrder`, `applyDropLogic`, `selectBriefingItems`).
- `budget.ts` — spend log and budget guard. `deliverable.ts` — rendering. `run.ts` — CLI orchestration.

## Known limits

- The archive parser depends on berlin.de's markup (`cell nowrap date` list rows, `textile` body). If berlin.de changes it, the archive yields nothing, the log says `police archive: 0 releases`, and the police sample falls back to the ~10 feed reports (R3's tolerance is then one report).
- Police requests go 10 per call; production sends every unplaced report of a run in one call.
- News $/month is an upper bound: eval batches are full (10 items) while production averages ~2.5 new items per call.
