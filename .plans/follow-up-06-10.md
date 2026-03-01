# Follow-Up: Milestones 06–10

## User Input Needed

1. **OPENAI_API_KEY** — Milestone 07 requires `OPENAI_API_KEY` env var for AI summaries. The system works without it (summary section simply doesn't appear). Optional: set `OPENAI_MODEL` to override the default `gpt-4.1-mini`.

## DB Migrations

1. **Milestone 06** — `weatherSnapshots` table defined in `schema.ts` but not written to at runtime. Weather data is cache-only (same pattern as news in milestones 01-05). Postgres persistence and cache warmup will be wired when DB connection is established.
2. **Milestone 07** — `aiSummaries` table defined in `schema.ts` but not written to at runtime. Same cache-only pattern.

## Files to Be Deleted

_None yet._

## Implementation Issues

_None yet._
