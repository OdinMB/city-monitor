# Follow-Up: Milestones 01–05

## User Input Needed

1. **DATABASE_URL for local development** — Milestone 02 includes Drizzle config and schema placeholder but no DB connection at runtime yet (deferred to milestone 04 when data actually needs persisting). Need to confirm: do you have a local Postgres instance or want to use Docker? Example: `postgresql://postgres:postgres@localhost:5432/city_monitor`

## DB Migrations

1. **Milestone 02** — `packages/server/src/db/schema.ts` exists but is empty (tables added in milestones 04+). No migration to run yet.
2. **Milestone 04** — `news_articles` table schema will be added. Run `npm run db:push --workspace=packages/server` after setting `DATABASE_URL`.

## Files to Be Deleted

_None yet._

## Implementation Issues

1. **DB connection module not wired at runtime** — `packages/server/src/db/index.ts` was not created yet because there are no tables to query. It will be created in milestone 04 when the news pipeline needs to write to Postgres. The cache layer works standalone with in-memory storage.
2. **Cache warmup deferred** — `cache-warmup.ts` depends on having data in Postgres. Will be implemented alongside the first data pipeline (milestone 04).
