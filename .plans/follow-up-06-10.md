# Follow-Up: Milestones 06–10

## User Input Needed

1. **OPENAI_API_KEY** — Milestone 07 requires `OPENAI_API_KEY` env var for AI summaries. The system works without it (summary section simply doesn't appear). Optional: set `OPENAI_MODEL` to override the default `gpt-4.1-mini`.

## DB Migrations

1. **Milestone 06** — `weatherSnapshots` table defined in `schema.ts` but not written to at runtime. Weather data is cache-only (same pattern as news in milestones 01-05). Postgres persistence and cache warmup will be wired when DB connection is established.
2. **Milestone 07** — `aiSummaries` table defined in `schema.ts` but not written to at runtime. Same cache-only pattern.
3. **Milestone 09** — `transitDisruptions` table defined in `schema.ts` but not written to at runtime. Same cache-only pattern.
4. **Milestone 10** — `events` and `safetyReports` tables defined in `schema.ts` but not written to at runtime. Same cache-only pattern.

## Files to Be Deleted

_None yet._

## Implementation Issues

1. **Milestone 10** — Events ingestion is a placeholder. No Berlin events RSS/API source has been configured. The infrastructure is ready; once a source URL is added to `berlin.ts` config (`dataSources.events`), the `ingestCityEvents` function needs a real implementation.
2. **Milestone 10** — District extraction in safety ingestion is hardcoded to Berlin districts. When adding a second city, move districts into city config or add per-city district lists.
