import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { isPortFree, pickFreePorts } from '../lib/ports.mjs';
import { checkOutFolder, isInside, mainCheckoutOf, newRunId, REPO_ROOT, runLayout } from '../lib/paths.mjs';

/**
 * A main checkout with two linked worktrees, laid out as git lays them out:
 * one nested in it under .claude/worktrees/, one outside it. Only the files
 * the harness reads; no git runs.
 */
function fakeRepo() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-')));
  const main = path.join(tmp, 'repos', 'main');
  const nested = path.join(main, '.claude', 'worktrees', 'wt');
  const outside = path.join(tmp, 'elsewhere', 'wt2');
  for (const [checkout, name, gitdirLine] of [
    [nested, 'wt', `gitdir: ${path.join(main, '.git', 'worktrees', 'wt')}\n`],
    [outside, 'wt2', `gitdir: ${path.relative(outside, path.join(main, '.git', 'worktrees', 'wt2'))}\r\n`],
  ]) {
    const gitDir = path.join(main, '.git', 'worktrees', name);
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'commondir'), '../..\n');
    fs.mkdirSync(checkout, { recursive: true });
    fs.writeFileSync(path.join(checkout, '.git'), gitdirLine);
  }
  return { tmp, main, nested, outside };
}

describe('pickFreePorts', () => {
  it('picks distinct loopback ports and leaves them free', async () => {
    const ports = await pickFreePorts(3);
    assert.equal(new Set(ports).size, 3);
    for (const port of ports) {
      assert.ok(port > 0 && port < 65536);
      assert.equal(await isPortFree(port), true);
    }
  });

  it('isPortFree sees a listener on 127.0.0.1', async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    assert.equal(await isPortFree(port), false);
    await new Promise((resolve) => server.close(resolve));
    assert.equal(await isPortFree(port), true);
  });
});

describe('checkOutFolder', () => {
  it('refuses a folder inside the checkout', () => {
    assert.match(checkOutFolder(path.join(REPO_ROOT, 'harness-out')).error, /inside the checkout/);
    assert.match(checkOutFolder(path.join(REPO_ROOT, 'packages', 'web', 'x', 'y')).error, /inside the checkout/);
    assert.match(checkOutFolder(REPO_ROOT).error, /inside the checkout/);
  });

  it('refuses a folder the checkout sits in', () => {
    assert.match(checkOutFolder(path.dirname(REPO_ROOT)).error, /holds the checkout/);
    assert.match(checkOutFolder(path.parse(REPO_ROOT).root).error, /holds the checkout/);
  });

  it('refuses a symlink that leads into the checkout', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    try {
      const link = path.join(tmp, 'link');
      fs.symlinkSync(REPO_ROOT, link);
      assert.match(checkOutFolder(path.join(link, 'out')).error, /inside the checkout/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('refuses a folder inside the main checkout when run from a worktree nested in it', () => {
    const { tmp, main, nested } = fakeRepo();
    try {
      for (const out of [path.join(main, 'harness-out'), path.join(main, 'packages', 'web', 'x'), path.join(main, '.claude', 'worktrees', 'other', 'x')]) {
        assert.equal(
          checkOutFolder(out, nested).error,
          `--out ${out} is inside the main checkout ${main} (this run is from its worktree ${nested}); give a folder outside it`,
        );
      }
      // Folders above the worktree hold it, as before.
      for (const out of [main, path.join(main, '.claude'), path.dirname(main)]) assert.match(checkOutFolder(out, nested).error, /holds the checkout/, out);
      assert.match(checkOutFolder(path.join(nested, 'x'), nested).error, /inside the checkout/);
      fs.symlinkSync(main, path.join(tmp, 'link'));
      assert.match(checkOutFolder(path.join(tmp, 'link', 'out'), nested).error, /inside the main checkout/);
      assert.equal(checkOutFolder(path.join(tmp, 'out'), nested).out, path.join(tmp, 'out'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('refuses a folder inside or holding the main checkout when run from a worktree outside it', () => {
    const { tmp, main, outside } = fakeRepo();
    try {
      assert.match(checkOutFolder(path.join(main, 'harness-out'), outside).error, /inside the main checkout/);
      assert.match(checkOutFolder(path.dirname(main), outside).error, /holds the main checkout/);
      assert.equal(checkOutFolder(path.join(tmp, 'side'), outside).out, path.join(tmp, 'side'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('from the main checkout itself, refuses only what it refused before', () => {
    const { tmp, main } = fakeRepo();
    try {
      assert.match(checkOutFolder(path.join(main, 'harness-out'), main).error, /is inside the checkout/);
      assert.equal(checkOutFolder(path.join(tmp, 'out'), main).out, path.join(tmp, 'out'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('refuses a folder inside the main checkout the real checkout belongs to', () => {
    const main = mainCheckoutOf(REPO_ROOT);
    // A linked worktree's .git is a file; the main checkout's is a folder.
    const linked = fs.statSync(path.join(REPO_ROOT, '.git'), { throwIfNoEntry: false })?.isFile() === true;
    if (linked) assert.ok(main && main !== REPO_ROOT, 'this worktree has a main checkout of its own');
    assert.match(checkOutFolder(path.join(main ?? REPO_ROOT, 'harness-out')).error, linked ? /inside the main checkout/ : /inside the checkout/);
  });

  it('accepts a folder elsewhere, existing or not', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    try {
      assert.equal(checkOutFolder(tmp).out, fs.realpathSync(tmp));
      assert.equal(checkOutFolder(path.join(tmp, 'new', 'deeper')).out, path.join(fs.realpathSync(tmp), 'new', 'deeper'));
      fs.writeFileSync(path.join(tmp, 'file'), '');
      assert.match(checkOutFolder(path.join(tmp, 'file')).error, /not a folder/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('mainCheckoutOf', () => {
  it('finds the main checkout from a nested worktree, an outside one with a relative gitdir, and the main checkout itself', () => {
    const { tmp, main, nested, outside } = fakeRepo();
    try {
      assert.equal(mainCheckoutOf(nested), main);
      assert.equal(mainCheckoutOf(outside), main);
      assert.equal(mainCheckoutOf(main), main);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('falls back to the path shape when a worktree\'s git folder has no commondir', () => {
    const { tmp, main, nested } = fakeRepo();
    try {
      fs.rmSync(path.join(main, '.git', 'worktrees', 'wt', 'commondir'));
      assert.equal(mainCheckoutOf(nested), main);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('is null without a .git, for a submodule and for an unreadable .git file', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-')));
    try {
      assert.equal(mainCheckoutOf(tmp), null);
      const sub = path.join(tmp, 'sub');
      fs.mkdirSync(path.join(tmp, 'super', '.git', 'modules', 'sub'), { recursive: true });
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, '.git'), `gitdir: ${path.join(tmp, 'super', '.git', 'modules', 'sub')}\n`);
      assert.equal(mainCheckoutOf(sub), null);
      fs.writeFileSync(path.join(sub, '.git'), 'not a gitdir line\n');
      assert.equal(mainCheckoutOf(sub), null);
      // With no main checkout found, only the checkout's own rules apply.
      assert.equal(checkOutFolder(path.join(tmp, 'out'), sub).out, path.join(tmp, 'out'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('run layout', () => {
  it('puts every folder of a run under <out>/<run id>', () => {
    const id = newRunId(new Date('2026-10-26T10:11:12.345Z'));
    assert.match(id, /^20261026-101112Z-[0-9a-f]{6}$/);
    const layout = runLayout('/o', id);
    for (const [key, value] of Object.entries(layout)) {
      assert.ok(isInside(value, path.join('/o', id)), key);
    }
  });

  it('gives two runs different ids', () => assert.notEqual(newRunId(), newRunId()));
});
