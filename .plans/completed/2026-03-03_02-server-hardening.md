# Server Hardening

Prevent silent crashes, overlapping cron jobs, and undetected startup failures.

## Changes

### 1. Graceful shutdown — `packages/server/src/index.ts`

Add SIGTERM and SIGINT handlers that:
- Stop the cron scheduler
- Close the HTTP server (stop accepting new connections, let in-flight requests drain)
- Close the database connection pool
- Log shutdown reason and exit cleanly

Wrap the top-level `createApp()` + `app.listen()` in try/catch — log and `process.exit(1)` on startup failure.

### 2. Unhandled rejection handler — `packages/server/src/index.ts`

Add `process.on('unhandledRejection', ...)` that logs the error with full context and exits with code 1. An unhandled rejection in a data pipeline could leave the server in an inconsistent state — better to crash and let Render restart.

### 3. DB connection test on startup — `packages/server/src/db/index.ts`

After creating the Drizzle client, run a lightweight test query (e.g., `SELECT 1`) to verify the connection is live. If it fails, throw so the startup catch block handles it. Currently `postgres()` is lazy — the server starts fine even if the DB is unreachable, then crashes on the first real query.

### 4. Cron job execution locks — `packages/server/src/lib/scheduler.ts`

Add a `_running` flag per job. Before executing a job's handler, check the flag. If the previous run is still in progress, skip the current invocation and log a warning. This prevents overlapping runs for slow jobs like feed ingestion or geocoding.

### 5. Cron failure tracking — `packages/server/src/lib/scheduler.ts` + `routes/health.ts`

Track last success/failure time per job in the scheduler. Expose this in the health endpoint so monitoring can detect when a cron job has been failing silently. Currently errors are logged but health always reports "ok".

## Testing

- Unit test: scheduler skips overlapping runs
- Unit test: health endpoint reports job failures
- Integration: startup fails cleanly if DB is unreachable (mock postgres to throw)

## Scope

- 4 files modified
- No migration, no new dependencies
