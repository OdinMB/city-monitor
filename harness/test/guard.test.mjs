import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertGuard,
  buildChildEnv,
  checkDatabaseTarget,
  expectedValues,
  GuardError,
  guardProblems,
  loadFixtures,
  PLANTED,
  plantGuardTest,
  prepareChildEnvs,
  validateFixtures,
} from '../lib/guard.mjs';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'pw-0123456789abcdef';
const DB_PORT = 54_001;
const API_PORT = 54_002;
const PROXY_PORT = 54_003;
const DB_URL = `postgres://harness:${PASSWORD}@127.0.0.1:${DB_PORT}/city_monitor_dev`;

const dirs = { home: '/out/run/home', config: '/out/run/home/.config', cache: '/out/run/home/.cache', data: '/out/run/home/.local/share', tmp: '/out/run/tmp' };
const fixtures = validateFixtures({ LANG: 'C.UTF-8', NO_PROXY: '127.0.0.1,localhost', NODE_USE_ENV_PROXY: '1' });

/** A shell as an agent's would look: secrets, a database, a proxy, Node options. */
const shellEnv = {
  PATH: '/usr/bin:/bin',
  HOME: '/root',
  DATABASE_URL: 'postgres://prod.example/db',
  OPENAI_API_KEY: 'invented-key-value',
  HTTPS_PROXY: 'http://corp-proxy:3128',
  NODE_OPTIONS: '--env-file=.env',
  SYNTHETIC_DATABASE_URL: 'postgres://localhost:5434/city_monitor_dev',
  PGHOST: 'db.example',
};

function seedSetup(extraOverrides = {}) {
  const extra = { SYNTHETIC_DATABASE_URL: DB_URL, ...extraOverrides };
  const base = { shellEnv, dirs, proxyPort: PROXY_PORT, fixtures, extra, platform: 'linux' };
  return { env: buildChildEnv(base), expected: expectedValues(base) };
}

describe('buildChildEnv', () => {
  it('keeps only PATH from the shell and sets everything else itself', () => {
    const { env } = seedSetup();
    assert.deepEqual(Object.keys(env).sort(), [
      'HOME', 'HTTPS_PROXY', 'HTTP_PROXY', 'LANG', 'NODE_USE_ENV_PROXY', 'NO_PROXY', 'PATH', 'SYNTHETIC_DATABASE_URL', 'TMPDIR',
      'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'http_proxy', 'https_proxy',
    ]);
    assert.equal(env.PATH, '/usr/bin:/bin');
    assert.equal(env.HOME, '/out/run/home');
    assert.equal(env.SYNTHETIC_DATABASE_URL, DB_URL);
    for (const name of ['DATABASE_URL', 'OPENAI_API_KEY', 'NODE_OPTIONS', 'PGHOST']) assert.equal(env[name], undefined, name);
  });

  it('points every proxy variable at the closed loopback port', () => {
    const { env } = seedSetup();
    for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) assert.equal(env[name], `http://127.0.0.1:${PROXY_PORT}`);
    assert.equal(env.NO_PROXY, '127.0.0.1,localhost');
    assert.equal(env.NODE_USE_ENV_PROXY, '1');
  });

  it('adds the Windows folders and system names on win32', () => {
    const base = { shellEnv: { ...shellEnv, SYSTEMROOT: 'C:\\Windows', COMSPEC: 'cmd.exe' }, dirs, proxyPort: PROXY_PORT, fixtures, platform: 'win32' };
    const env = buildChildEnv(base);
    assert.equal(env.USERPROFILE, dirs.home);
    assert.equal(env.SYSTEMROOT, 'C:\\Windows');
    assert.deepEqual(guardProblems(env, { expected: expectedValues(base), platform: 'win32' }), []);
  });
});

describe('guardProblems', () => {
  it('passes the environment the harness built', () => {
    const { env, expected } = seedSetup();
    assert.deepEqual(guardProblems(env, { expected, databasePort: DB_PORT, platform: 'linux' }), []);
  });

  it('refuses a name on no allowlist, as a dotenv file would add', () => {
    const { env, expected } = seedSetup();
    const problems = guardProblems({ ...env, SOME_DOTENV_NAME: 'x' }, { expected, databasePort: DB_PORT, platform: 'linux' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /no allowlist \(SOME_DOTENV_NAME\)/);
  });

  it('refuses a configuration variable the product reads, even with any value', () => {
    const { env, expected } = seedSetup();
    for (const name of ['OPENAI_API_KEY', 'DATABASE_URL', 'ALLOWED_ORIGINS', 'VITE_API_BASE', 'PGHOST', 'NODE_ENV']) {
      const problems = guardProblems({ ...env, [name]: 'x' }, { expected, databasePort: DB_PORT, platform: 'linux' });
      assert.ok(problems.some((p) => p.includes('must be unset') && p.includes(name)), name);
    }
  });

  it('refuses a harness name holding another value', () => {
    const { env, expected } = seedSetup();
    const problems = guardProblems({ ...env, HOME: '/root' }, { expected, platform: 'linux' });
    assert.ok(problems.some((p) => p.includes('HOME')));
  });

  it('refuses a harness name that is missing', () => {
    const { env, expected } = seedSetup();
    const { TMPDIR: _, ...rest } = env;
    assert.ok(guardProblems(rest, { expected, platform: 'linux' }).some((p) => p.includes('TMPDIR')));
  });

  it('refuses an unset database URL: the product would fall back to a loopback default the run did not start', () => {
    const base = { shellEnv, dirs, proxyPort: PROXY_PORT, fixtures, platform: 'linux' };
    const problems = guardProblems(buildChildEnv(base), { expected: expectedValues(base), databasePort: DB_PORT, platform: 'linux' });
    assert.ok(problems.some((p) => p.includes('docker-compose default')));
  });

  it('never puts a value into a problem', () => {
    const { env, expected } = seedSetup();
    const planted = { ...env, SYNTHETIC_DATABASE_URL: `postgres://harness:${PASSWORD}@db.example:5432/city_monitor_dev`, OPENAI_API_KEY: 'invented-key-value' };
    const text = guardProblems(planted, { expected, databasePort: DB_PORT, platform: 'linux' }).join(' ');
    assert.ok(!text.includes(PASSWORD));
    assert.ok(!text.includes('invented-key-value'));
  });

  it('assertGuard throws a GuardError whose message starts with the refusal', () => {
    const { env, expected } = seedSetup();
    assert.throws(() => assertGuard({ ...env, X: '1' }, { expected, platform: 'linux' }), (err) => err instanceof GuardError && err.message.startsWith('hermetic-guard: refused:'));
  });
});

describe('checkDatabaseTarget', () => {
  const ok = { port: DB_PORT };
  it('accepts the run\'s own database', () => assert.equal(checkDatabaseTarget(DB_URL, ok), null));
  it('refuses another host', () => assert.match(checkDatabaseTarget(PLANTED.offMachineTarget, ok), /host guard-test\.invalid/));
  it('refuses localhost by name, since the run listens on 127.0.0.1', () => {
    assert.match(checkDatabaseTarget(DB_URL.replace('127.0.0.1', 'localhost'), ok), /host localhost/);
  });
  it('refuses a loopback port the run did not start', () => assert.match(checkDatabaseTarget(PLANTED.loopbackTarget, ok), /port 9 is not 54001/));
  it('refuses the docker-compose default', () => {
    assert.match(checkDatabaseTarget('postgres://cmdev:x@localhost:5434/city_monitor_dev', ok), /host localhost/);
  });
  it('refuses another database, user, query parameters and host lists', () => {
    assert.match(checkDatabaseTarget(DB_URL.replace('/city_monitor_dev', '/other'), ok), /database other/);
    assert.match(checkDatabaseTarget(DB_URL.replace('harness:', 'cmdev:'), ok), /user/);
    assert.match(checkDatabaseTarget(`${DB_URL}?host=db.example`, ok), /query parameters/);
    assert.match(checkDatabaseTarget(`postgres://harness:x@127.0.0.1:${DB_PORT},db.example:5432/city_monitor_dev`, ok), /several hosts/);
    assert.match(checkDatabaseTarget('mysql://127.0.0.1/x', ok), /scheme/);
  });
});

describe('the negative test cases', () => {
  const run = (guardTest) => () => prepareChildEnvs({
    shellEnv, dirs, proxyPort: PROXY_PORT, fixtures, databaseUrl: DB_URL, databasePort: DB_PORT, apiPort: API_PORT, guardTest, platform: 'linux',
  });

  it('a run without a guard test passes, and no role sees the shell\'s secrets', () => {
    const { envs } = run(undefined)();
    assert.deepEqual(Object.keys(envs).sort(), ['api', 'browser', 'postgres', 'seed', 'web']);
    for (const env of Object.values(envs)) {
      for (const name of ['DATABASE_URL', 'OPENAI_API_KEY', 'NODE_OPTIONS', 'PGHOST']) assert.equal(env[name], undefined);
    }
    assert.equal(envs.api.PORT, String(API_PORT));
    assert.equal(envs.web.SYNTHETIC_DATABASE_URL, undefined);
  });

  it('env: an unlisted name planted after clearing is refused', () => {
    assert.throws(run('env'), (err) => err instanceof GuardError && err.message.includes(PLANTED.envName));
  });

  it('target: an off-machine database URL is refused', () => {
    assert.throws(run('target'), (err) => err instanceof GuardError && err.message.includes('guard-test.invalid'));
  });

  it('target-loopback: a loopback port the run did not start is refused', () => {
    assert.throws(run('target-loopback'), (err) => err instanceof GuardError && err.message.includes('port 9'));
  });

  it('network plants nothing into the environment (its GET happens at run time)', () => {
    const env = { A: '1' };
    assert.equal(plantGuardTest('network', env), env);
    assert.doesNotThrow(run('network'));
  });

  it('an unknown case is an error', () => assert.throws(() => plantGuardTest('nope', {}), /unknown guard test/));
});

describe('fixtures', () => {
  it('loads harness/fixture-vars.json', () => {
    const loaded = loadFixtures(path.join(HARNESS, 'fixture-vars.json'));
    assert.equal(loaded.NO_PROXY, '127.0.0.1,localhost');
    assert.equal(loaded.NODE_USE_ENV_PROXY, '1');
  });

  it('refuses a fixture that sets a configuration variable, a harness name or a proxy', () => {
    for (const name of ['OPENAI_API_KEY', 'SYNTHETIC_DATABASE_URL', 'PORT', 'HOME', 'PATH', 'HTTPS_PROXY', 'PGPASSWORD', 'TMPDIR']) {
      assert.throws(() => validateFixtures({ [name]: 'x' }), /cannot be a fixture/, name);
    }
  });

  it('refuses values that are not strings and names that are not names', () => {
    assert.throws(() => validateFixtures({ A: 1 }), /must be a string/);
    assert.throws(() => validateFixtures({ 'A-B': 'x' }), /not a variable name/);
    assert.throws(() => validateFixtures([]), /one object/);
  });
});
