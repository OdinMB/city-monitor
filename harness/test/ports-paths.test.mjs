import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { isPortFree, pickFreePorts } from '../lib/ports.mjs';
import { checkOutFolder, isInside, newRunId, REPO_ROOT, runLayout } from '../lib/paths.mjs';

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
