/**
 * The hermetic guard: what every process the harness starts may see in its
 * environment, and where it may connect. Pure functions, so the parent
 * (before it starts anything) and each Node child (before it seeds, builds or
 * serves) run the same checks. Problems name variables and hosts, never values.
 */

import fs from 'node:fs';

/** The database the synthetic seed and API accept (packages/server/src/synthetic/local-guard.ts). */
export const DATABASE_NAME = 'city_monitor_dev';
/** The Postgres role the harness creates with initdb. */
export const DATABASE_USER = 'harness';

/**
 * Every variable the product's configuration code reads, found by reading
 * that code: packages/server/src (app.ts, config/index.ts, db/index.ts,
 * index.ts, dev-synthetic.ts, lib/openai.ts, lib/llm-client.ts, lib/geocode.ts,
 * cron/ingest-*.ts, routes/health.ts, synthetic/local-guard.ts) and
 * packages/web (src/lib/api.ts, vite.config.ts). harness/test/config-vars.test.mjs
 * fails when the server reads a name missing here.
 */
export const PRODUCT_CONFIG_VARS = Object.freeze([
  'DATABASE_URL',
  'NODE_ENV',
  'PORT',
  'ACTIVE_CITIES',
  'ALLOWED_ORIGINS',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_SUMMARY_EFFORT',
  'OPENAI_FILTER_MODEL',
  'OPENAI_FILTER_EFFORT',
  'OPENAI_GEO_MODEL',
  'OPENAI_GEO_EFFORT',
  'TOMTOM_API_KEY',
  'WAQI_API_TOKEN',
  'TICKETMASTER_CONSUMER_KEY',
  'FIRECRAWL_API_KEY',
  'LOCATIONIQ_TOKEN',
  'SYNTHETIC_DATABASE_URL',
  'SYNTHETIC_ALLOW_DATABASE_NAME',
  'VITE_API_BASE',
]);

/**
 * Variables the product's libraries read on their own: postgres.js falls back
 * to the PG* names, the OpenAI client and LangChain read their key, base URL
 * and tracing switches.
 */
export const LIBRARY_CONFIG_VARS = Object.freeze([
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'PGSSLMODE',
  'OPENAI_BASE_URL',
  'OPENAI_ORGANIZATION',
  'LANGCHAIN_TRACING_V2',
  'LANGCHAIN_API_KEY',
  'LANGSMITH_TRACING',
  'LANGSMITH_API_KEY',
  'LANGSMITH_ENDPOINT',
]);

/** Configuration variables the harness itself sets in a child, to values it created. */
export const HARNESS_SET_CONFIG_VARS = Object.freeze(['SYNTHETIC_DATABASE_URL', 'PORT']);

/** Variables passed through from the shell unchanged: only what finds programs and, on Windows, the system. */
export function passthroughNames(platform = process.platform) {
  return platform === 'win32' ? ['PATH', 'SYSTEMROOT', 'COMSPEC'] : ['PATH'];
}

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class GuardError extends Error {
  constructor(problems) {
    super(`hermetic-guard: refused: ${problems.join('; ')}`);
    this.name = 'GuardError';
    this.problems = problems;
  }
}

/**
 * Reads harness/fixture-vars.json: invented values every child gets. A fixture
 * may not set a product configuration variable, a library one, a passthrough
 * name or anything the harness sets itself.
 */
export function loadFixtures(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return validateFixtures(parsed);
}

export function validateFixtures(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('fixture-vars.json must hold one object of name: value strings');
  }
  const reserved = new Set([
    ...PRODUCT_CONFIG_VARS,
    ...LIBRARY_CONFIG_VARS,
    ...passthroughNames('win32'),
    ...harnessPathNames('win32'),
    ...PROXY_NAMES,
  ]);
  const fixtures = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (!NAME_PATTERN.test(name)) throw new Error(`fixture-vars.json: ${name} is not a variable name`);
    if (typeof value !== 'string') throw new Error(`fixture-vars.json: ${name} must be a string`);
    if (reserved.has(name)) throw new Error(`fixture-vars.json: ${name} is set by the harness or read by the product, so it cannot be a fixture`);
    fixtures[name] = value;
  }
  return Object.freeze(fixtures);
}

/** The proxy variables, pointed at a loopback port nothing listens on. */
export const PROXY_NAMES = Object.freeze(['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']);

/** Per-user folders, all pointed under the run folder. */
export function harnessPathNames(platform = process.platform) {
  const names = ['HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'TMPDIR'];
  if (platform === 'win32') names.push('USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP');
  return names;
}

/**
 * The environment of one child, built from nothing: passthrough names from
 * the shell, folders under the run folder, the closed proxy, the fixtures and
 * the values this role needs (`extra`, e.g. the harness database URL).
 */
export function buildChildEnv({ shellEnv, dirs, proxyPort, fixtures, extra = {}, platform = process.platform }) {
  const env = {};
  for (const name of passthroughNames(platform)) {
    const value = shellEnv[name] ?? (platform === 'win32' ? shellEnv[name.charAt(0) + name.slice(1).toLowerCase()] : undefined);
    if (value !== undefined) env[name] = value;
  }
  Object.assign(env, expectedValues({ dirs, proxyPort, fixtures, extra, platform }));
  return env;
}

/** Every name the harness sets in a child, with the exact value it sets. */
export function expectedValues({ dirs, proxyPort, fixtures, extra = {}, platform = process.platform }) {
  const values = {
    HOME: dirs.home,
    XDG_CONFIG_HOME: dirs.config,
    XDG_CACHE_HOME: dirs.cache,
    XDG_DATA_HOME: dirs.data,
    TMPDIR: dirs.tmp,
  };
  if (platform === 'win32') {
    Object.assign(values, { USERPROFILE: dirs.home, APPDATA: dirs.config, LOCALAPPDATA: dirs.data, TEMP: dirs.tmp, TMP: dirs.tmp });
  }
  const proxy = `http://127.0.0.1:${proxyPort}`;
  for (const name of PROXY_NAMES) values[name] = proxy;
  return { ...values, ...fixtures, ...extra };
}

/**
 * Why `url` is not the database the harness started, or null when it is.
 * `undefined` fails too: the product would fall back to its docker-compose
 * default on localhost:5434, which the harness did not start.
 */
export function checkDatabaseTarget(url, { port, database = DATABASE_NAME, user = DATABASE_USER }) {
  if (url === undefined || url === '') {
    return 'SYNTHETIC_DATABASE_URL is unset, so the product would use its docker-compose default (localhost:5434), which this run did not start';
  }
  const authority = url.slice(url.indexOf('://') + 3).split(/[?/]/)[0] ?? '';
  if (authority.includes(',') || authority.toLowerCase().includes('%2c')) return 'the database URL lists several hosts';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'the database URL is not a valid URL';
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return `the database URL's scheme is ${parsed.protocol}`;
  if (parsed.hostname !== '127.0.0.1') return `the database host ${parsed.hostname || '(none)'} is not 127.0.0.1, where this run's Postgres listens`;
  if (parsed.port !== String(port)) return `the database port ${parsed.port || '(default)'} is not ${port}, the port this run's Postgres listens on`;
  if (parsed.pathname !== `/${database}`) return `the database ${parsed.pathname.slice(1) || '(none)'} is not ${database}`;
  if (decodeURIComponent(parsed.username) !== user) return `the database user is not ${user}, the role this run created`;
  if ([...parsed.searchParams.keys()].length > 0) return 'the database URL has query parameters, which could change where it connects';
  return null;
}

/**
 * Every problem with `env` as the environment of a child, or [] when there
 * is none:
 * - it holds only passthrough names and the names the harness set
 *   (`expected`), each with the exact value the harness set;
 * - every product or library configuration variable is unset, except the
 *   ones the harness sets (database URL, port), which hold its values;
 * - the database URL, when the role reads one, is the harness's own.
 */
export function guardProblems(env, { expected, platform = process.platform, databasePort }) {
  const problems = [];
  const passthrough = new Set(passthroughNames(platform));
  const names = Object.keys(env);

  const unlisted = names.filter((name) => !passthrough.has(name) && !(name in expected)).sort();
  if (unlisted.length > 0) {
    problems.push(`the environment holds names on no allowlist (${unlisted.join(', ')}), as a dotenv file or the shell would add them`);
  }

  const wrong = Object.keys(expected).filter((name) => env[name] !== expected[name]).sort();
  if (wrong.length > 0) problems.push(`these names do not hold the value the harness set: ${wrong.join(', ')}`);

  const harnessSet = new Set(HARNESS_SET_CONFIG_VARS);
  const configSet = [...PRODUCT_CONFIG_VARS, ...LIBRARY_CONFIG_VARS]
    .filter((name) => env[name] !== undefined && !(harnessSet.has(name) && name in expected))
    .sort();
  if (configSet.length > 0) problems.push(`configuration variables are set that must be unset: ${configSet.join(', ')}`);

  if (databasePort !== undefined) {
    const reason = checkDatabaseTarget(env.SYNTHETIC_DATABASE_URL, { port: databasePort });
    if (reason) problems.push(reason);
  }
  return problems;
}

/** Throws a GuardError listing every problem guardProblems finds. */
export function assertGuard(env, options) {
  const problems = guardProblems(env, options);
  if (problems.length > 0) throw new GuardError(problems);
}

/**
 * The environment and expected values of every child of one run, each
 * checked by the guard; the negative test's case is planted into the seed's
 * environment (the first process that reads the database target) after it
 * was cleared. Throws a GuardError before anything has started.
 */
export function prepareChildEnvs({ shellEnv, dirs, proxyPort, fixtures, databaseUrl, databasePort, apiPort, guardTest, platform = process.platform }) {
  const roles = {
    postgres: { extra: {} },
    seed: { extra: { SYNTHETIC_DATABASE_URL: databaseUrl }, databasePort },
    api: { extra: { SYNTHETIC_DATABASE_URL: databaseUrl, PORT: String(apiPort) }, databasePort },
    web: { extra: {} },
    browser: { extra: {} },
  };
  const envs = {};
  const expected = {};
  for (const [role, { extra, databasePort: port }] of Object.entries(roles)) {
    const base = { shellEnv, dirs, proxyPort, fixtures, extra, platform };
    let env = buildChildEnv(base);
    if (role === 'seed') env = plantGuardTest(guardTest, env);
    expected[role] = expectedValues(base);
    assertGuard(env, { expected: expected[role], databasePort: port, platform });
    envs[role] = env;
  }
  return { envs, expected };
}

export const GUARD_TESTS = Object.freeze(['env', 'target', 'target-loopback', 'network']);

/** The planted values: an invented name, an off-machine database, a loopback port this run did not start. */
export const PLANTED = Object.freeze({
  envName: 'GUARD_TEST_UNLISTED',
  offMachineTarget: 'postgres://guard-test.invalid/x',
  loopbackTarget: 'postgres://127.0.0.1:9/x',
  networkUrl: 'https://example.com/',
});

/**
 * Plants the negative test's case into an environment the harness already
 * cleared: an unlisted name, as a dotenv file would add it, or another
 * database URL where the product reads its target.
 */
export function plantGuardTest(kind, env) {
  switch (kind) {
    case undefined:
    case 'network':
      return env;
    case 'env':
      return { ...env, [PLANTED.envName]: 'planted' };
    case 'target':
      return { ...env, SYNTHETIC_DATABASE_URL: PLANTED.offMachineTarget };
    case 'target-loopback':
      return { ...env, SYNTHETIC_DATABASE_URL: PLANTED.loopbackTarget };
    default:
      throw new Error(`unknown guard test ${kind}`);
  }
}
