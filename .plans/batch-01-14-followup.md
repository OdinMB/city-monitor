# Batch Plans 01-14 Follow-up

## User Input Needed

_(Questions that need user decisions before finalizing)_

## DB Migrations

- **Plan 04 (Backend Performance):** Added `news_city_published_idx` index to `news_items(city_id, published_at)` in schema. Run `npm run db:generate` and `npm run db:migrate` from `packages/server/`.

## Files to Be Deleted

_(Files that should be removed after user confirmation)_

## Implementation Issues

- **Plan 03 (Security):** Skipped Zod schemas for external API response validation (Open-Meteo, WAQI, VBB, VIZ, PEGELONLINE). This is a defensive hardening measure that touches all 15+ cron files. Consider doing this as a separate follow-up task.
- **Plan 04 (Backend Performance):** Skipped batch geocoding optimization. Requires adding `p-limit` dependency and reworking geocode call sites in news and safety ingestion. Consider as a separate follow-up task.
