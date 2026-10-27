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
 * entry: the synthetic seed script or dev-synthetic.ts. No dotenv loading:
 * the product's scripts with --env-file-if-exists are never used.
 */

import fs from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertGuard, checkDatabaseTarget, GuardError, PLANTED } from './guard.mjs';
import { enforceLoopbackListen } from './listen-guard.mjs';
import { MARKERS } from './processes.mjs';

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
// seed-synthetic.ts reads --seed from argv
process.argv = role === 'seed'
  ? [process.argv[0], fileURLToPath(entry), '--seed', String(spec.seed)]
  : [process.argv[0], fileURLToPath(entry)];
await import(entry.href);
