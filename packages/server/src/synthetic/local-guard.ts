/**
 * Guards for the synthetic dev database: the seed and the synthetic server
 * only ever touch the docker-compose database (or another database on this
 * machine named explicitly), and the synthetic server only ever talks to
 * this machine.
 */

/** The `db` service in docker-compose.yml. */
export const LOCAL_DATABASE_NAME = 'city_monitor_dev';
export const LOCAL_DATABASE_URL = `postgres://cmdev:cmdev_local@localhost:5434/${LOCAL_DATABASE_NAME}`;

/** Names a local database other than city_monitor_dev that synthetic data may wipe. */
export const ALLOW_DATABASE_ENV = 'SYNTHETIC_ALLOW_DATABASE_NAME';

// No ::1: postgres.js cannot connect to a bracketed IPv6 host from a URL
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** Query parameters that only tune the connection; any other could change where it goes. */
const SAFE_PARAMS = new Set(['sslmode', 'connect_timeout', 'application_name']);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

/**
 * The database synthetic mode uses: SYNTHETIC_DATABASE_URL if set, else the
 * docker-compose database. Never DATABASE_URL, which may name a shared or
 * production database.
 */
export function syntheticDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.SYNTHETIC_DATABASE_URL || LOCAL_DATABASE_URL;
}

/**
 * Why `url` is not a database synthetic data may go into, or null when it is.
 * Follows how postgres.js connects: a comma in the authority, even
 * percent-encoded, can turn it into a list of servers; an empty host or
 * database name falls back to PGHOST or PGDATABASE; and query parameters are
 * sent as startup parameters, where `database` or `user` override the URL's.
 * A local port can forward to a remote server, so the database name must be
 * city_monitor_dev or the one SYNTHETIC_ALLOW_DATABASE_NAME names.
 */
export function checkLocalDatabaseUrl(url: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const authority = url.slice(url.indexOf('://') + 3).split(/[?/]/)[0] ?? '';
  if (authority.includes(',') || authority.toLowerCase().includes('%2c')) return 'it lists several hosts';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'it is not a valid URL';
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    return `its scheme is ${parsed.protocol} rather than postgres:`;
  }
  for (const key of parsed.searchParams.keys()) {
    if (!SAFE_PARAMS.has(key.toLowerCase())) return `its query parameter ${key} could change where it connects`;
  }
  if (!parsed.hostname) return 'it names no host, so postgres.js would fall back to PGHOST';
  if (!isLocalHost(parsed.hostname)) return `its host ${parsed.hostname} is not this machine`;

  const name = parsed.pathname.slice(1);
  if (!name) return 'it names no database, so postgres.js would fall back to PGDATABASE';
  if (name !== LOCAL_DATABASE_NAME && name !== env[ALLOW_DATABASE_ENV]) {
    return `its database ${name} is not ${LOCAL_DATABASE_NAME}, and ${ALLOW_DATABASE_ENV} does not name it ` +
      '(a local port can forward to a remote server)';
  }
  return null;
}

/** Throws, naming the host or database but never the password, unless `url` passes checkLocalDatabaseUrl. */
export function assertLocalDatabaseUrl(url: string, env: NodeJS.ProcessEnv = process.env): void {
  const problem = checkLocalDatabaseUrl(url, env);
  if (problem) {
    throw new Error(
      `Refusing to use this database for synthetic data: ${problem}. ` +
      `Synthetic data only goes into the ${LOCAL_DATABASE_NAME} database on localhost or 127.0.0.1 ` +
      `(or one ${ALLOW_DATABASE_ENV} names). Leave SYNTHETIC_DATABASE_URL unset for the docker-compose database.`,
    );
  }
}

/**
 * Make fetch() reject every request to a host other than this machine, so
 * nothing in synthetic mode (a route's live fallback, a stray job) reaches
 * an external API. Returns a function that restores the original fetch.
 */
export function blockExternalFetch(): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!isLocalHost(url.hostname)) {
      return Promise.reject(new Error(`synthetic mode blocks outbound requests (${url.host})`));
    }
    return realFetch(input, init);
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}
