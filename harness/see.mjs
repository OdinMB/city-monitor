#!/usr/bin/env node
/**
 * A guarded local run of the web app on synthetic data, screenshotted in
 * headless Chromium. One foreground command:
 *
 *   node harness/see.mjs --out <folder> [--path /berlin] [--viewport 390x844] ...
 *
 * It starts its own Postgres, seeds it, starts the API in synthetic mode,
 * builds and serves the web app, all on 127.0.0.1 on ports it picks, and
 * stops everything on exit, timeout, error, SIGINT or SIGTERM. Each run
 * writes only under <out>/<run id>. See harness/README.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { parseArgs, validateSteps, UsageError, USAGE } from './lib/args.mjs';
import { GuardError, loadFixtures, PLANTED, prepareChildEnvs } from './lib/guard.mjs';
import { checkOutFolder, createRunFolders, newRunId, REPO, runLayout } from './lib/paths.mjs';
import { pickFreePorts, isPortFree } from './lib/ports.mjs';
import { databaseUrl, findPgBin, lookupSystemUser, startPostgres } from './lib/postgres.mjs';
import { MARKERS, spawnNode, stopAll, track, waitForExit } from './lib/processes.mjs';
import { loopbackAgent, startStaticServer, stopStaticServer } from './lib/static-server.mjs';
import { combinations, launchBrowser, loadPlaywright, probeBrowserNetwork, runPages } from './lib/browser.mjs';

const EXIT = { ok: 0, error: 1, guard: 2, steps: 3 };
const PRODUCT_CHILD = path.join(REPO.harness, 'lib', 'product-child.mjs');
const WEB_BUILD = path.join(REPO.harness, 'lib', 'web-build.mjs');

let cleaningUp = null;
function cleanup() {
  cleaningUp ??= stopAll();
  return cleaningUp;
}

let finishing = false;
async function finish(code, message) {
  if (finishing) return;
  finishing = true;
  if (message) (code === EXIT.ok ? console.log : console.error)(message);
  await cleanup();
  process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => finish(signal === 'SIGINT' ? 130 : 143, `stopping on ${signal}`));
}

function writeGuardFile(dir, name, spec) {
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(spec), { mode: 0o600 });
  return file;
}

/**
 * Runs a Node child and collects its stdout lines; `waitFor(line)` resolves
 * once that exact line appears and rejects (with the exit code) if the child
 * exits first or time runs out.
 */
function startChild(options) {
  const lines = [];
  const waiters = [];
  const started = spawnNode({
    ...options,
    onLine: (line) => {
      lines.push(line);
      for (const w of waiters) if (w.line === line) w.resolve();
    },
  });
  const waitFor = (line, timeoutMs, what) => new Promise((resolve, reject) => {
    if (lines.includes(line)) return resolve();
    const timer = setTimeout(() => reject(new Error(`${what}: not reached after ${Math.round(timeoutMs / 1000)}s; see ${started.logPath}`)), timeoutMs);
    waiters.push({ line, resolve: () => { clearTimeout(timer); resolve(); } });
    started.child.once('exit', (code) => setTimeout(() => {
      clearTimeout(timer);
      if (lines.includes(line)) return resolve();
      reject(Object.assign(new Error(`${what}: the process exited with ${code}; see ${started.logPath}`), { exitCode: code }));
    }, 200));
  });
  return { ...started, lines, waitFor };
}

function getStatus(port, pathname) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 5_000, agent: loopbackAgent }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => req.destroy());
  });
}

async function main() {
  const startedAt = new Date();
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) return finish(EXIT.error, `${err.message}\n\n${USAGE}`);
    throw err;
  }
  if (args.help) return finish(EXIT.ok, USAGE);

  const outCheck = checkOutFolder(args.out);
  if (outCheck.error) return finish(EXIT.error, outCheck.error);
  let steps = [];
  if (args.stepsFile) {
    try {
      steps = validateSteps(JSON.parse(fs.readFileSync(args.stepsFile, 'utf8')));
    } catch (err) {
      return finish(EXIT.error, `--steps ${args.stepsFile}: ${err.message}`);
    }
  }
  const fixtures = loadFixtures(path.join(REPO.harness, 'fixture-vars.json'));

  // Ports: Postgres, the API, and the closed proxy port nothing will listen on.
  const [pgPort, apiPort, proxyPort] = await pickFreePorts(3);
  const layout = runLayout(outCheck.out, newRunId(startedAt));
  const dirs = { home: layout.home, config: layout.config, cache: layout.cache, data: layout.data, tmp: layout.tmp };
  const password = crypto.randomBytes(18).toString('hex');
  const dbUrl = databaseUrl({ port: pgPort, password });
  // The environment of every child, built from nothing; then the guard, before anything starts.
  let envs;
  let expected;
  try {
    ({ envs, expected } = prepareChildEnvs({
      shellEnv: process.env, dirs, proxyPort, fixtures, databaseUrl: dbUrl, databasePort: pgPort, apiPort, guardTest: args.guardTest,
    }));
  } catch (err) {
    if (err instanceof GuardError) return finish(EXIT.guard, err.message);
    throw err;
  }

  let playwright;
  let pgBin;
  let pgUser = null;
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  try {
    ({ playwright } = loadPlaywright({ explicit: args.playwright, repoRoot: REPO.root }));
    pgBin = findPgBin({ explicit: args.pgBin });
    if (asRoot) {
      pgUser = lookupSystemUser(args.pgUser);
      if (!pgUser) throw new Error(`running as root: no system user ${args.pgUser} for Postgres; pass --pg-user <name>`);
    }
  } catch (err) {
    return finish(EXIT.error, err.message);
  }

  const timer = setTimeout(() => finish(EXIT.error, `timed out after ${args.timeoutSeconds}s; stopping everything`), args.timeoutSeconds * 1000);
  timer.unref();

  createRunFolders(layout);
  // Playwright's own temporary profile and artifacts go under the run too.
  process.env.TMPDIR = layout.tmp;
  console.log(`run folder: ${layout.run}`);

  if (args.guardTest === 'network') {
    const probeBrowser = await launchBrowser({ playwright, env: envs.browser, proxyPort });
    track({ name: 'probe-browser', stop: () => probeBrowser.close() });
    const browserBlocked = await probeBrowserNetwork({ browser: probeBrowser, url: PLANTED.networkUrl });
    const probeSpec = writeGuardFile(layout.guard, 'network-probe', { expected: expected.web });
    const probe = startChild({ name: 'network-probe', script: PRODUCT_CHILD, args: ['network-probe', probeSpec], env: envs.web, cwd: REPO.server, logsDir: layout.logs });
    await waitForExit(probe.child, 30_000);
    const nodeBlocked = probe.lines.includes(`${MARKERS.networkProbe} blocked`);
    if (browserBlocked && nodeBlocked) {
      return finish(EXIT.guard, `hermetic-guard: refused: the GET to ${PLANTED.networkUrl} failed in the browser and in Node`);
    }
    console.error(`guard-test network: the GET to ${PLANTED.networkUrl} went through (browser blocked: ${browserBlocked}, Node blocked: ${nodeBlocked})`);
    await probeBrowser.close();
  }

  // The web build runs while Postgres starts and the seed runs.
  const webSpec = writeGuardFile(layout.guard, 'web', { expected: expected.web, webOutDir: layout.web, viteCacheDir: layout.viteCache });
  const webBuild = startChild({ name: 'web-build', script: WEB_BUILD, args: [webSpec], env: envs.web, cwd: REPO.web, logsDir: layout.logs });
  webBuild.child.once('exit', (code) => {
    if (code !== 0) finish(code === 2 ? EXIT.guard : EXIT.error, `the web build failed (exit ${code}); see ${webBuild.logPath}`);
  });
  const webBuilt = webBuild.waitFor(`${MARKERS.guardOk} web-build`, 60_000, 'web build guard')
    .then(() => waitForExit(webBuild.child, 300_000))
    .then((code) => {
      if (code !== 0) throw Object.assign(new Error(`the web build failed (exit ${code}); see ${webBuild.logPath}`), { exitCode: code });
    });
  webBuilt.catch(() => {});

  const pgLog = fs.createWriteStream(path.join(layout.logs, 'postgres.log'), { flags: 'a' });
  await startPostgres({ bin: pgBin, layout, port: pgPort, password, env: envs.postgres, asRoot, user: pgUser, logStream: pgLog, track });

  const seedSpec = writeGuardFile(layout.guard, 'seed', { expected: expected.seed, databasePort: pgPort, seed: args.seed });
  const seed = startChild({ name: 'seed', script: PRODUCT_CHILD, args: ['seed', seedSpec], env: envs.seed, cwd: REPO.server, logsDir: layout.logs });
  await seed.waitFor(`${MARKERS.guardOk} seed`, 120_000, 'seed guard');
  const seedCode = await waitForExit(seed.child, 240_000);
  if (seedCode !== 0) return finish(EXIT.error, `the seed failed (exit ${seedCode}); see ${seed.logPath}`);

  const apiSpec = writeGuardFile(layout.guard, 'api', { expected: expected.api, databasePort: pgPort, apiPort });
  const api = startChild({ name: 'api', script: PRODUCT_CHILD, args: ['api', apiSpec], env: envs.api, cwd: REPO.server, logsDir: layout.logs });
  await api.waitFor(`${MARKERS.guardOk} api`, 120_000, 'API guard');
  await api.waitFor(`${MARKERS.apiListening} ${apiPort}`, 120_000, 'API start');
  if ((await getStatus(apiPort, '/api/health')) !== 200) return finish(EXIT.error, `the API does not answer /api/health; see ${api.logPath}`);

  await webBuilt;
  const { server: web, port: webPort } = await startStaticServer({ root: layout.web, apiPort });
  track({ name: 'web', stop: () => stopStaticServer(web) });

  console.log(`hermetic-guard: ok port ${webPort}`);

  const browser = await launchBrowser({ playwright, env: envs.browser, proxyPort });
  track({ name: 'browser', stop: () => browser.close() });
  const runs = await runPages({
    browser,
    baseUrl: `http://127.0.0.1:${webPort}`,
    combos: combinations(args),
    steps,
    scroll: args.scroll,
    fullPage: args.fullPage,
    settleMs: args.settleMs,
    timezone: args.timezone,
    shotsDir: layout.shots,
    runDir: layout.run,
  });

  const blockedHosts = {};
  for (const r of runs) for (const [host, n] of Object.entries(r.blockedHosts)) blockedHosts[host] = (blockedHosts[host] ?? 0) + n;
  const stepFailed = runs.some((r) => r.stepErrors.length > 0);
  await cleanup();
  const portsFreeAfterStop = {};
  for (const [name, port] of Object.entries({ web: webPort, api: apiPort, postgres: pgPort })) portsFreeAfterStop[name] = await isPortFree(port);

  const report = {
    harness: 'see',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    seed: args.seed,
    ports: { web: webPort, api: apiPort, postgres: pgPort },
    portsFreeAfterStop,
    params: {
      paths: args.paths,
      viewports: args.viewports.map((v) => `${v.width}x${v.height}`),
      langs: args.langs,
      themes: args.themes,
      scroll: args.scroll,
      fullPage: args.fullPage,
      settleMs: args.settleMs,
      timezone: args.timezone,
      steps: steps.length,
    },
    blockedHosts,
    runs,
  };
  fs.writeFileSync(layout.report, `${JSON.stringify(report, null, 2)}\n`);

  for (const r of runs) {
    const stepNote = r.stepErrors.length ? `, step errors: ${r.stepErrors.map((e) => `${e.step} ${e.error}`).join(' | ')}` : '';
    console.log(`${r.path} ${r.viewport} ${r.lang} ${r.theme}: ${r.screenshots.length} screenshot(s), ${r.consoleErrors.length} console error(s), ${r.pageErrors.length} page error(s), ${r.failedRequests.length} failed request(s) to this run${stepNote}`);
  }
  console.log(`blocked hosts: ${Object.entries(blockedHosts).map(([h, n]) => `${h} (${n})`).join(', ') || 'none'}`);
  console.log(`ports free after stop: ${Object.values(portsFreeAfterStop).every(Boolean) ? 'yes' : JSON.stringify(portsFreeAfterStop)}`);
  console.log(`report: ${layout.report}`);
  return finish(stepFailed ? EXIT.steps : EXIT.ok);
}

main().catch((err) => {
  const message = String(err?.message ?? err);
  const guard = err?.exitCode === 2 || message.startsWith('hermetic-guard: refused');
  return finish(guard ? EXIT.guard : EXIT.error, `error: ${err?.stack ?? err}`);
});
