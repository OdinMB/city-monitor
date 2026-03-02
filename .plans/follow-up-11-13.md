# Follow-Up: Milestones 11–13

## User Input Needed

- **Sentry DSN**: M11 step 3 requires a Sentry DSN for both frontend (`@sentry/react`) and server (`@sentry/node`). Do you want to set up Sentry, or skip it for now? If yes, provide the DSN or create a project at sentry.io and add `SENTRY_DSN` to both `.env` files.

## DB Migrations

- **Schema indices (M11)**: Added 5 indices to `schema.ts` (`weather_city_idx`, `transit_city_idx`, `events_city_date_idx`, `safety_city_published_idx`, `summaries_city_generated_idx`). Run `npm run db:generate` and `npm run db:migrate` in `packages/server` to apply.

## Files to Be Deleted

_None yet._

## Implementation Issues

_None yet._
