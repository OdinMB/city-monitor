/**
 * `npm run db:migrate`: applies pending migrations and says what went wrong
 * when it fails. Runs in the deploy's start command before the server starts.
 */
import { fileURLToPath } from 'node:url';
import { describeMigrationError, migrateDatabase, rootCause, runWithRetry } from '../db/migrate.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('migrate: DATABASE_URL is not set');
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const started = Date.now();
console.log(`migrate: applying migrations from ${migrationsFolder}`);

try {
  const { before, after } = await runWithRetry(() => migrateDatabase({ url, migrationsFolder }));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const applied = after - before;
  console.log(
    applied > 0
      ? `migrate: applied ${applied} migration${applied === 1 ? '' : 's'} (${after} in total) in ${seconds}s`
      : `migrate: nothing to apply (${after} migrations already applied), ${seconds}s`,
  );
} catch (err) {
  console.error(`migrate: failed after ${((Date.now() - started) / 1000).toFixed(1)}s\n  ${describeMigrationError(err)}`);
  const cause = rootCause(err);
  if (cause instanceof Error && cause.stack) console.error(cause.stack);
  process.exitCode = 1;
}
