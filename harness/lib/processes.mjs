/**
 * Starting and stopping the run's processes. Every child is registered on
 * start; stopAll() stops them in reverse order, and a process 'exit' hook
 * kills whatever is still alive if the harness itself dies.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const tracked = [];

/**
 * Registers { name, child?, group?, stop } so stopAll() and the exit hook
 * reach it. `child` is a ChildProcess; in-process resources (the browser, the
 * web server) pass only `stop`. `group` marks a child started in its own
 * process group.
 */
export function track(entry) {
  tracked.push(entry);
}

function alive(child) {
  return child.exitCode === null && child.signalCode === null;
}

/** Signals a Node child's whole process group (its esbuild helper too), or the child alone on Windows. */
function signalGroup(child, signal) {
  if (!(child.pid > 0)) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    // already gone
  }
}

/** SIGTERM to the group, SIGKILL after `graceMs`. */
export async function stopNodeChild(child, graceMs = 5_000) {
  if (!alive(child)) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  signalGroup(child, 'SIGTERM');
  const done = await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), graceMs))]);
  if (!done) {
    signalGroup(child, 'SIGKILL');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 2_000))]);
  }
}

/** Stops every tracked child, newest first. Safe to call more than once. */
export async function stopAll() {
  while (tracked.length > 0) {
    const entry = tracked.pop();
    try {
      await entry.stop(entry.child);
    } catch {
      // keep stopping the rest
    }
  }
}

process.on('exit', () => {
  for (const { child, group } of tracked) {
    if (!child || !(child.pid > 0) || !alive(child)) continue;
    if (group) signalGroup(child, 'SIGKILL');
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
});

/**
 * Runs `node <script> ...args` with exactly `env`, in its own process group,
 * logging stdout and stderr to logs/<name>.log. `onLine` sees each stdout line.
 */
export function spawnNode({ name, script, args = [], env, cwd, logsDir, onLine = () => {} }) {
  const logPath = path.join(logsDir, `${name}.log`);
  const log = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn(process.execPath, [script, ...args], {
    env,
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  child.stderr.pipe(log, { end: false });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    log.write(`${line}\n`);
    onLine(line);
  });
  child.once('exit', () => setTimeout(() => log.end(), 50));
  track({ name, child, group: process.platform !== 'win32', stop: (c) => stopNodeChild(c) });
  return { child, logPath };
}

/**
 * Resolves with the child's exit code once it exits; rejects if it does not
 * exit within `timeoutMs`.
 */
export function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!alive(child)) return resolve(child.exitCode ?? 1);
    const timer = setTimeout(() => reject(new Error(`still running after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

/** Marker lines the Node children print on stdout. */
export const MARKERS = Object.freeze({
  guardOk: 'harness-child-guard: ok',
  apiListening: 'harness-api-listening',
  networkProbe: 'harness-network-probe:',
});
