/**
 * The run's own Postgres: initdb into the run folder, one server on
 * 127.0.0.1 on a port the harness picked, no Unix socket, password login for
 * one role, and the city_monitor_dev database.
 *
 * initdb and postgres refuse to run as root. As root, the harness runs them
 * in a user namespace (unshare --user) where root appears as --pg-user: the
 * files stay root's, so a run folder whose parents only root may enter (such
 * as a 0700 scratch folder) still works, and nothing is chowned.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DATABASE_NAME, DATABASE_USER } from './guard.mjs';

const EXE = process.platform === 'win32' ? '.exe' : '';

function hasPgBinaries(dir) {
  return ['initdb', 'postgres', 'createdb'].every((name) => fs.existsSync(path.join(dir, name + EXE)));
}

/**
 * The folder holding initdb, postgres and createdb: --pg-bin, else the first
 * PATH entry with all three, else the newest /usr/lib/postgresql/<n>/bin
 * (Debian and Ubuntu packages).
 */
export function findPgBin({ explicit, pathEnv = process.env.PATH ?? '', debianRoot = '/usr/lib/postgresql' } = {}) {
  if (explicit) {
    const dir = path.resolve(explicit);
    if (!hasPgBinaries(dir)) throw new Error(`--pg-bin ${dir} does not hold initdb, postgres and createdb`);
    return dir;
  }
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    if (hasPgBinaries(dir)) return dir;
  }
  if (fs.existsSync(debianRoot)) {
    const versions = fs.readdirSync(debianRoot).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
    for (const v of versions) {
      const dir = path.join(debianRoot, v, 'bin');
      if (hasPgBinaries(dir)) return dir;
    }
  }
  throw new Error('Postgres binaries not found: put initdb on PATH or pass --pg-bin <dir>');
}

/** uid and gid of a system user, from /etc/passwd. */
export function lookupSystemUser(name, passwd = fs.existsSync('/etc/passwd') ? fs.readFileSync('/etc/passwd', 'utf8') : '') {
  for (const line of passwd.split('\n')) {
    const [user, , uid, gid] = line.split(':');
    if (user === name && /^\d+$/.test(uid ?? '') && /^\d+$/.test(gid ?? '')) return { uid: Number(uid), gid: Number(gid) };
  }
  return null;
}

/**
 * How to run one Postgres program: directly, or as root inside a user
 * namespace where root appears as `user` (initdb looks its name up).
 */
export function pgCommand({ bin, program, args, asRoot, user }) {
  const exe = path.join(bin, program + EXE);
  if (!asRoot) return { command: exe, args };
  return {
    command: 'unshare',
    args: ['--user', `--map-user=${user.uid}`, `--map-group=${user.gid}`, '--', exe, ...args],
  };
}

export function initdbArgs(layout) {
  return [
    '-D', layout.pgData,
    '-U', DATABASE_USER,
    '--auth=scram-sha-256',
    `--pwfile=${layout.pgPwfile}`,
    '--encoding=UTF8',
    '--locale=C',
    '--no-sync',
  ];
}

/** The server listens on 127.0.0.1:`port` only, with no Unix socket, and logs to stderr. */
export function postgresArgs(layout, port) {
  return [
    '-D', layout.pgData,
    '-p', String(port),
    '-c', 'listen_addresses=127.0.0.1',
    '-c', 'unix_socket_directories=',
    // dynamic shared memory as files in the data folder, not in /dev/shm
    '-c', 'dynamic_shared_memory_type=mmap',
    '-c', 'logging_collector=off',
    '-c', 'fsync=off',
    '-c', 'synchronous_commit=off',
    '-c', 'full_page_writes=off',
    '-c', 'max_connections=40',
  ];
}

/**
 * Reads postmaster.pid: pid, port, listen address and status. The harness
 * checks these against the process it started before anything connects.
 */
export function readPostmasterPid(dataDir) {
  let text;
  try {
    text = fs.readFileSync(path.join(dataDir, 'postmaster.pid'), 'utf8');
  } catch {
    return null;
  }
  const lines = text.split('\n');
  return {
    pid: Number(lines[0]),
    dataDir: lines[1],
    port: Number(lines[3]),
    socketDir: lines[4] ?? '',
    listen: (lines[5] ?? '').trim(),
    status: (lines[7] ?? '').trim(),
  };
}

/** Why the running server is not the one this run started, or null. */
export function checkOwnPostmaster(info, { pid, port }) {
  if (!info) return 'postmaster.pid is missing';
  if (info.pid !== pid) return `postmaster.pid names process ${info.pid}, not ${pid}, which this run started`;
  if (info.port !== port) return `postmaster.pid names port ${info.port}, not ${port}`;
  if (info.listen !== '127.0.0.1') return `Postgres listens on ${info.listen || '(nothing)'}, not 127.0.0.1 only`;
  if (info.socketDir !== '') return 'Postgres opened a Unix socket';
  return null;
}

export function databaseUrl({ port, password }) {
  return `postgres://${DATABASE_USER}:${encodeURIComponent(password)}@127.0.0.1:${port}/${DATABASE_NAME}`;
}

function run(label, cmd, { env, logStream, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd.command, cmd.args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with ${code ?? signal}; see ${logStream.path}`));
    });
  });
}

/**
 * initdb, start, wait until ready, check it is this run's server, create the
 * database. Returns { child, url } and registers the child with `track`.
 */
export async function startPostgres({ bin, layout, port, password, env, asRoot, user, logStream, track, readyTimeoutMs = 30_000 }) {
  fs.writeFileSync(layout.pgPwfile, `${password}\n`, { mode: 0o600 });
  await run('initdb', pgCommand({ bin, program: 'initdb', args: initdbArgs(layout), asRoot, user }), { env, logStream, cwd: layout.pg });

  const cmd = pgCommand({ bin, program: 'postgres', args: postgresArgs(layout, port), asRoot, user });
  const child = spawn(cmd.command, cmd.args, { env, cwd: layout.pg, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
  track({ name: 'postgres', child, stop: stopPostgres });

  const deadline = Date.now() + readyTimeoutMs;
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Postgres exited during startup; see ${logStream.path}`);
    const info = readPostmasterPid(layout.pgData);
    if (info && info.status === 'ready') {
      const problem = checkOwnPostmaster(info, { pid: child.pid, port });
      if (problem) throw new Error(`hermetic-guard: refused: ${problem}`);
      break;
    }
    if (Date.now() > deadline) throw new Error(`Postgres was not ready after ${readyTimeoutMs / 1000}s; see ${logStream.path}`);
    await new Promise((r) => setTimeout(r, 200));
  }

  await run(
    'createdb',
    { command: path.join(bin, 'createdb' + EXE), args: ['-h', '127.0.0.1', '-p', String(port), '-U', DATABASE_USER, DATABASE_NAME] },
    { env: { ...env, PGPASSWORD: password }, logStream, cwd: layout.pg },
  );
  return { child, url: databaseUrl({ port, password }) };
}

/** Fast shutdown (SIGINT), then immediate (SIGQUIT), then SIGKILL. */
export async function stopPostgres(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const waitFor = (ms) => Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);
  for (const [signal, ms] of [['SIGINT', 15_000], ['SIGQUIT', 5_000], ['SIGKILL', 5_000]]) {
    try {
      child.kill(signal);
    } catch {
      return;
    }
    if (await waitFor(ms)) return;
  }
}
