/**
 * Applies the Drizzle migrations in `packages/server/drizzle` with drizzle-orm's
 * migrator, the same journal table (`drizzle.__drizzle_migrations`) that
 * `drizzle-kit migrate` used. It replaces drizzle-kit in the deploy's start
 * command because drizzle-kit's progress spinner swallows the error: a failed
 * run printed only "applying migrations..." and exit code 1.
 *
 * A database that cannot be reached is retried a few times, so a short
 * Postgres blip during a deploy (a restart, maintenance) does not fail the
 * boot. An error from a migration itself is not retried: it is printed with
 * its Postgres code and the statement, and the run exits 1.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { describeError } from '../lib/logger.js';

/** Socket and server-startup errors worth another attempt. */
const CONNECTION_ERROR_CODES = new Set([
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  '57P03', // cannot_connect_now: the server is starting up or shutting down
]);

interface CodedError {
  code?: unknown;
  cause?: unknown;
}

/** The first error code down the cause chain (Drizzle wraps the driver's error). */
export function errorCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let depth = 0; depth < 5 && typeof e === 'object' && e !== null; depth++) {
    const code = (e as CodedError).code;
    if (typeof code === 'string' && code) return code;
    e = (e as CodedError).cause;
  }
  return undefined;
}

export function isConnectionError(err: unknown): boolean {
  const code = errorCode(err);
  return code !== undefined && CONNECTION_ERROR_CODES.has(code);
}

/**
 * The driver's own error under Drizzle's "Failed query: <sql> params: ..."
 * wrapper, whose message repeats the statement and hides the reason at its end.
 */
export function rootCause(err: unknown): unknown {
  let e: unknown = err;
  for (let depth = 0; depth < 5; depth++) {
    const cause = typeof e === 'object' && e !== null ? (e as CodedError).cause : undefined;
    if (cause === undefined || cause === null) return e;
    e = cause;
  }
  return e;
}

/** What a migration error says: the Postgres code and message, its detail and hint, and the statement. */
export function describeMigrationError(err: unknown): string {
  const lines = [describeError(rootCause(err))];
  let e: unknown = err;
  for (let depth = 0; depth < 5 && typeof e === 'object' && e !== null; depth++) {
    const pg = e as { detail?: unknown; hint?: unknown; where?: unknown; query?: unknown };
    if (typeof pg.detail === 'string' && pg.detail) lines.push(`detail: ${pg.detail}`);
    if (typeof pg.hint === 'string' && pg.hint) lines.push(`hint: ${pg.hint}`);
    if (typeof pg.where === 'string' && pg.where) lines.push(`where: ${pg.where}`);
    if (typeof pg.query === 'string' && pg.query) lines.push(`statement: ${pg.query.trim().slice(0, 2000)}`);
    e = (e as CodedError).cause;
  }
  return [...new Set(lines)].join('\n  ');
}

export interface MigrationAttemptResult {
  /** Migrations recorded in the journal table before and after the run. */
  before: number;
  after: number;
}

export interface RunMigrationsOptions {
  attempts?: number;
  /** Delay before the second attempt; doubles each time. */
  baseDelayMs?: number;
  log?: (msg: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs `attempt` until it succeeds, retrying connection errors only.
 * Throws the last error when every attempt failed or the error is not a
 * connection error.
 */
export async function runWithRetry<T>(
  attempt: () => Promise<T>,
  { attempts = 5, baseDelayMs = 2000, log = console.log, sleep = defaultSleep }: RunMigrationsOptions = {},
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (i >= attempts || !isConnectionError(err)) throw err;
      const delay = baseDelayMs * 2 ** (i - 1);
      log(`migrate: database not reachable (${describeError(rootCause(err))}), attempt ${i} of ${attempts}; retrying in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MigrateDatabaseOptions {
  url: string;
  migrationsFolder: string;
  /** Seconds to wait for a connection before giving up on one attempt. */
  connectTimeoutSeconds?: number;
  /**
   * How long one statement waits for a table lock before failing. Without
   * it, an ALTER TABLE queued behind the running server's open transaction
   * waits forever, and every query on that table queues behind the ALTER.
   */
  lockTimeoutMs?: number;
}

/** One attempt: connect, apply pending migrations, close. */
export async function migrateDatabase({
  url,
  migrationsFolder,
  connectTimeoutSeconds = 10,
  lockTimeoutMs = 30_000,
}: MigrateDatabaseOptions): Promise<MigrationAttemptResult> {
  const client = postgres(url, {
    max: 1,
    connect_timeout: connectTimeoutSeconds,
    onnotice: () => {},
    connection: { application_name: 'city-monitor-migrate', lock_timeout: lockTimeoutMs },
  });
  try {
    const db = drizzle(client);
    const before = await countApplied(db);
    await migrate(db, { migrationsFolder });
    const after = await countApplied(db);
    return { before, after };
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function countApplied(db: ReturnType<typeof drizzle>): Promise<number> {
  // Two queries: Postgres resolves a table name while planning, so one CASE
  // over a table that does not exist yet fails on a fresh database.
  const exists = await db.execute<{ t: string | null }>(sql`SELECT to_regclass('drizzle.__drizzle_migrations')::text AS t`);
  if (!exists[0]?.t) return 0;
  const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
  return Number(rows[0]?.n ?? 0);
}
