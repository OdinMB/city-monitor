import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { enforceLoopbackListen, loopbackListenArgs } from '../lib/listen-guard.mjs';

describe('loopbackListenArgs', () => {
  const cb = () => {};
  it('adds 127.0.0.1 where no host is given', () => {
    assert.deepEqual(loopbackListenArgs([3001, cb]), [3001, '127.0.0.1', cb]);
    assert.deepEqual(loopbackListenArgs([3001]), [3001, '127.0.0.1']);
    assert.deepEqual(loopbackListenArgs(['3001', cb]), ['3001', '127.0.0.1', cb]);
    assert.deepEqual(loopbackListenArgs([3001, 511, cb]), [3001, '127.0.0.1', 511, cb]);
    assert.deepEqual(loopbackListenArgs([]), [0, '127.0.0.1']);
    assert.deepEqual(loopbackListenArgs([cb]), [0, '127.0.0.1', cb]);
    assert.deepEqual(loopbackListenArgs([{ port: 3001 }, cb]), [{ port: 3001, host: '127.0.0.1' }, cb]);
  });

  it('keeps loopback hosts', () => {
    assert.deepEqual(loopbackListenArgs([3001, 'localhost', cb]), [3001, '127.0.0.1', cb]);
    assert.deepEqual(loopbackListenArgs([{ port: 1, host: '127.0.0.1' }]), [{ port: 1, host: '127.0.0.1' }]);
  });

  it('refuses every other host, socket paths and handles', () => {
    assert.throws(() => loopbackListenArgs([3001, '0.0.0.0']), /refused host 0\.0\.0\.0/);
    assert.throws(() => loopbackListenArgs([3001, '::']), /refused host/);
    assert.throws(() => loopbackListenArgs([{ port: 1, host: '0.0.0.0' }]), /refused host/);
    assert.throws(() => loopbackListenArgs(['/tmp/sock']), /socket path or handle/);
    assert.throws(() => loopbackListenArgs([{ path: '/tmp/sock' }]), /socket path or handle/);
    assert.throws(() => loopbackListenArgs([{ fd: 3 }]), /socket path or handle/);
  });
});

describe('enforceLoopbackListen', () => {
  it('binds a server that asked for every interface to 127.0.0.1', async () => {
    const seen = [];
    const restore = enforceLoopbackListen((server) => seen.push(server.address()));
    const server = http.createServer();
    try {
      await new Promise((resolve) => server.listen(0, resolve));
      assert.equal(server.address().address, '127.0.0.1');
      assert.equal(seen[0].address, '127.0.0.1');
    } finally {
      restore();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
