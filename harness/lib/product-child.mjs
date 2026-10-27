/**
 * Entry of the harness's server processes, run as
 *   node harness/lib/product-child.mjs <seed|api|network-probe> <guard-file>
 * with the environment the parent cleared. Before any product code seeds or
 * serves, it checks in this process:
 * - the environment against the guard file the parent wrote (names, values,
 *   configuration variables, database target);
 * - the database URL the product itself resolves (syntheticDatabaseUrl) is
 *   the run's own Postgres, and passes the product's own local guard;
 * - outbound fetch is blocked and the model client is not configured;
 * - (api) every server binds 127.0.0.1, the API on the port the parent picked.
 * Then it prints "harness-child-guard: ok <role>" and imports the product's
 * entry: the synthetic seed script or dev-synthetic.ts, both with --city set
 * to the run's city. No dotenv loading: the product's scripts with
 * --env-file-if-exists are never used.
 *
 * (seed) Once the seed script has finished, the same process applies the
 * run's scenario (lib/scenarios.mjs) to the database it seeded, for the
 * run's city only: it checks the database target again, opens it with the
 * product's openLocalDatabase and prints "harness-scenario: applied <name>",
 * after "harness-scenario: left out <types>" when the city holds no data of
 * a type the scenario changes. The default scenario changes nothing and
 * opens nothing.
 */

import fs from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CITY_ID_PATTERN } from './cities.mjs';
import { assertGuard, checkDatabaseTarget, GuardError, PLANTED } from './guard.mjs';
import { enforceLoopbackListen } from './listen-guard.mjs';
import { MARKERS } from './processes.mjs';
import { applyScenario, DEFAULT_SCENARIO, leftOutTypes, SCENARIO_NAMES, scenarioPlace, scenarioTypes } from './scenarios.mjs';
import { snapshotStore } from './snapshot-store.mjs';

const SERVER_SRC = new URL('../../packages/server/src/', import.meta.url);

function refuse(problem) {
  console.error(problem instanceof GuardError ? problem.message : `hermetic-guard: refused: ${problem}`);
  process.exit(2);
}

const [role, guardFile] = process.argv.slice(2);
if (!['seed', 'api', 'network-probe'].includes(role) || !guardFile) refuse('usage: product-child.mjs <seed|api|network-probe> <guard-file>');

const spec = JSON.parse(fs.readFileSync(guardFile, 'utf8'));
try {
  assertGuard(process.env, { expected: spec.expected, databasePort: spec.databasePort });
} catch (err) {
  refuse(err);
}
const scenario = spec.scenario ?? DEFAULT_SCENARIO;
if (role === 'seed' && !SCENARIO_NAMES.includes(scenario)) refuse(`unknown scenario ${scenario}`);
if (role !== 'network-probe' && !(typeof spec.city === 'string' && CITY_ID_PATTERN.test(spec.city))) refuse('the guard file names no city');

if (role === 'network-probe') {
  // The negative test's one GET from inside the run, through Node's own fetch
  // with the cleared environment (proxy variables on a closed loopback port).
  try {
    await fetch(PLANTED.networkUrl, { signal: AbortSignal.timeout(10_000) });
    console.log(`${MARKERS.networkProbe} reached`);
  } catch {
    console.log(`${MARKERS.networkProbe} blocked`);
  }
  process.exit(0);
}

const { register: registerTsx } = await import('tsx/esm/api');
registerTsx();
register('./shared-source-hook.mjs', import.meta.url);

const localGuard = await import(new URL('synthetic/local-guard.ts', SERVER_SRC).href);
const url = localGuard.syntheticDatabaseUrl();
const reason = checkDatabaseTarget(url, { port: spec.databasePort });
if (reason) refuse(reason);
try {
  localGuard.assertLocalDatabaseUrl(url);
} catch (err) {
  refuse(err.message);
}

localGuard.blockExternalFetch();
const fetchBlocked = await fetch('https://guard-check.invalid/').then(
  () => false,
  (err) => /blocks outbound/.test(String(err?.message)),
);
if (!fetchBlocked) refuse('outbound fetch is not blocked in this process');

const openai = await import(new URL('lib/openai.ts', SERVER_SRC).href);
if (openai.isConfigured()) refuse('the model client is configured; it must be off');

if (role === 'api') {
  if (process.env.PORT !== String(spec.apiPort)) refuse('PORT is not the port the harness picked for the API');
  enforceLoopbackListen((server) => {
    const address = server.address();
    if (!address || typeof address !== 'object' || address.address !== '127.0.0.1') {
      refuse('a server bound an address other than 127.0.0.1');
    }
    if (address.port === spec.apiPort) console.log(`${MARKERS.apiListening} ${address.port}`);
  });
}

console.log(`${MARKERS.guardOk} ${role}`);

const entry = new URL(role === 'seed' ? 'scripts/seed-synthetic.ts' : 'dev-synthetic.ts', SERVER_SRC);
// seed-synthetic.ts reads --seed and --city from argv, dev-synthetic.ts --city
process.argv = role === 'seed'
  ? [process.argv[0], fileURLToPath(entry), '--seed', String(spec.seed), '--city', spec.city]
  : [process.argv[0], fileURLToPath(entry), '--city', spec.city];
await import(entry.href);

if (role === 'seed') {
  // The seed script reports a failure through the exit code, after printing why
  if (process.exitCode) process.exit(process.exitCode);
  if (scenarioTypes(scenario).length > 0) {
    // The city the seed script wrote, from the product's config, which it set to serve that city
    const { getCityConfig } = await import(new URL('config/index.ts', SERVER_SRC).href);
    const city = getCityConfig(spec.city);
    if (city?.id !== spec.city) {
      console.error(`the seed script did not serve ${spec.city}, so the scenario has no city to run on`);
      process.exit(1);
    }
    const { syntheticCoverage } = await import(new URL('synthetic/generate.ts', SERVER_SRC).href);
    const place = scenarioPlace(city, syntheticCoverage(city));
    const leftOut = leftOutTypes(scenario, place);
    // Checked again right before this process opens the database itself
    const target = localGuard.syntheticDatabaseUrl();
    const problem = checkDatabaseTarget(target, { port: spec.databasePort });
    if (problem) refuse(problem);
    try {
      localGuard.assertLocalDatabaseUrl(target);
    } catch (err) {
      refuse(err.message);
    }
    const { openLocalDatabase } = await import(new URL('synthetic/seed.ts', SERVER_SRC).href);
    const { snapshots } = await import(new URL('db/schema.ts', SERVER_SRC).href);
    const { and, desc, eq, inArray } = await import('drizzle-orm');
    const local = openLocalDatabase(target);
    try {
      const store = snapshotStore(local.db, { table: snapshots, and, desc, eq, inArray }, spec.city);
      const changes = await applyScenario(store, scenario, new Date(), place);
      console.log(`scenario ${scenario} for ${spec.city}: ${changes.deletes.length} row(s) deleted, ${changes.updates.length} changed, ${changes.inserts.length} added`);
    } finally {
      await local.close();
    }
    if (leftOut.length > 0) console.log(`${MARKERS.scenarioLeftOut} ${leftOut.join(',')}`);
  }
  console.log(`${MARKERS.scenarioApplied} ${scenario}`);
}
