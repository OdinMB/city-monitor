/**
 * Where things are: the checkout the harness runs from, and the run folder
 * under --out that holds everything a run writes.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** The checkout this harness belongs to (the folder above harness/). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const REPO = Object.freeze({
  root: REPO_ROOT,
  server: path.join(REPO_ROOT, 'packages', 'server'),
  web: path.join(REPO_ROOT, 'packages', 'web'),
  shared: path.join(REPO_ROOT, 'shared'),
  harness: path.join(REPO_ROOT, 'harness'),
});

/** The real path of `p`, resolving symlinks in the part of it that exists. */
export function realPathOfNearest(p) {
  let current = path.resolve(p);
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.join(current, ...rest);
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

export function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * The absolute --out folder, or a refusal: never inside the checkout (where
 * it would show in git status) and never a folder the checkout sits in.
 */
export function checkOutFolder(out, repoRoot = REPO_ROOT) {
  const resolved = realPathOfNearest(out);
  const root = realPathOfNearest(repoRoot);
  if (isInside(resolved, root)) return { error: `--out ${resolved} is inside the checkout ${root}; give a folder outside it` };
  if (isInside(root, resolved)) return { error: `--out ${resolved} holds the checkout ${root}; give a folder outside it` };
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) return { error: `--out ${resolved} is not a folder` };
  return { out: resolved };
}

/** A fresh run id: UTC time plus a random suffix, so runs under one --out never collide. */
export function newRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Every folder of one run. Nothing is created here. */
export function runLayout(out, runId) {
  const run = path.join(out, runId);
  const home = path.join(run, 'home');
  return {
    run,
    home,
    config: path.join(home, '.config'),
    cache: path.join(home, '.cache'),
    data: path.join(home, '.local', 'share'),
    tmp: path.join(run, 'tmp'),
    logs: path.join(run, 'logs'),
    shots: path.join(run, 'screenshots'),
    pg: path.join(run, 'pg'),
    pgData: path.join(run, 'pg', 'data'),
    pgPwfile: path.join(run, 'pg', 'pwfile'),
    guard: path.join(run, 'guard'),
    viteCache: path.join(run, 'vite-cache'),
    web: path.join(run, 'web'),
    report: path.join(run, 'report.json'),
  };
}

export function createRunFolders(layout) {
  for (const dir of [layout.run, layout.home, layout.config, layout.cache, layout.data, layout.tmp, layout.logs, layout.shots, layout.pg, layout.guard]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
