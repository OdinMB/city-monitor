import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkOwnPostmaster,
  databaseUrl,
  findPgBin,
  initdbArgs,
  lookupSystemUser,
  pgCommand,
  postgresArgs,
  readPostmasterPid,
} from '../lib/postgres.mjs';
import { runLayout } from '../lib/paths.mjs';
import { checkDatabaseTarget } from '../lib/guard.mjs';

const layout = runLayout('/o', 'run');

describe('Postgres commands', () => {
  it('runs the programs directly when not root', () => {
    assert.deepEqual(pgCommand({ bin: '/pg', program: 'initdb', args: ['-D', 'x'], asRoot: false }), { command: path.join('/pg', 'initdb'), args: ['-D', 'x'] });
  });

  it('as root, runs them in a user namespace where root appears as the Postgres user', () => {
    const cmd = pgCommand({ bin: '/pg', program: 'postgres', args: ['-D', 'x'], asRoot: true, user: { uid: 102, gid: 104 } });
    assert.equal(cmd.command, 'unshare');
    assert.deepEqual(cmd.args, ['--user', '--map-user=102', '--map-group=104', '--', path.join('/pg', 'postgres'), '-D', 'x']);
  });

  it('initdb writes into the run folder with password login for one role', () => {
    const args = initdbArgs(layout);
    assert.deepEqual(args.slice(0, 4), ['-D', layout.pgData, '-U', 'harness']);
    assert.ok(args.includes('--auth=scram-sha-256'));
    assert.ok(args.includes(`--pwfile=${layout.pgPwfile}`));
  });

  it('the server listens on 127.0.0.1 only, on the picked port, with no Unix socket', () => {
    const args = postgresArgs(layout, 5555);
    assert.deepEqual(args.slice(0, 4), ['-D', layout.pgData, '-p', '5555']);
    assert.ok(args.includes('listen_addresses=127.0.0.1'));
    assert.ok(args.includes('unix_socket_directories='));
    assert.ok(args.includes('dynamic_shared_memory_type=mmap'));
  });

  it('the database URL is one the guard accepts', () => {
    const url = databaseUrl({ port: 5555, password: 'a/b c' });
    assert.equal(checkDatabaseTarget(url, { port: 5555 }), null);
  });
});

describe('postmaster.pid', () => {
  const pidFile = (lines) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    fs.writeFileSync(path.join(dir, 'postmaster.pid'), lines.join('\n'));
    return dir;
  };

  it('identifies the run\'s own server', () => {
    const dir = pidFile(['4242', '/o/run/pg/data', '1700000000', '5555', '', '127.0.0.1', '  1234   5678', 'ready   ', '']);
    try {
      const info = readPostmasterPid(dir);
      assert.deepEqual({ pid: info.pid, port: info.port, listen: info.listen, status: info.status, socketDir: info.socketDir }, {
        pid: 4242, port: 5555, listen: '127.0.0.1', status: 'ready', socketDir: '',
      });
      assert.equal(checkOwnPostmaster(info, { pid: 4242, port: 5555 }), null);
      assert.match(checkOwnPostmaster(info, { pid: 1, port: 5555 }), /not 1/);
      assert.match(checkOwnPostmaster(info, { pid: 4242, port: 6000 }), /port 5555/);
      assert.match(checkOwnPostmaster({ ...info, listen: '*' }, { pid: 4242, port: 5555 }), /listens on \*/);
      assert.match(checkOwnPostmaster({ ...info, socketDir: '/tmp' }, { pid: 4242, port: 5555 }), /Unix socket/);
      assert.match(checkOwnPostmaster(null, { pid: 4242, port: 5555 }), /missing/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is null when missing', () => assert.equal(readPostmasterPid('/nonexistent-harness-dir'), null));
});

describe('finding Postgres', () => {
  const fakeBin = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    for (const name of ['initdb', 'postgres', 'createdb']) fs.writeFileSync(path.join(dir, name), '');
    return dir;
  };

  it('takes --pg-bin, then PATH, then /usr/lib/postgresql/<newest>/bin', () => {
    const bin = fakeBin();
    const debian = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    try {
      assert.equal(findPgBin({ explicit: bin }), bin);
      assert.equal(findPgBin({ pathEnv: ['/nope', bin].join(path.delimiter), debianRoot: '/nope' }), bin);
      for (const v of ['15', '16']) {
        fs.mkdirSync(path.join(debian, v, 'bin'), { recursive: true });
        for (const name of ['initdb', 'postgres', 'createdb']) fs.writeFileSync(path.join(debian, v, 'bin', name), '');
      }
      assert.equal(findPgBin({ pathEnv: '', debianRoot: debian }), path.join(debian, '16', 'bin'));
      assert.throws(() => findPgBin({ explicit: debian }), /does not hold initdb/);
      assert.throws(() => findPgBin({ pathEnv: '', debianRoot: '/nope' }), /--pg-bin/);
    } finally {
      fs.rmSync(bin, { recursive: true, force: true });
      fs.rmSync(debian, { recursive: true, force: true });
    }
  });

  it('looks a system user up in /etc/passwd', () => {
    const passwd = 'root:x:0:0:root:/root:/bin/bash\npostgres:x:102:104::/var/lib/postgresql:/bin/bash\n';
    assert.deepEqual(lookupSystemUser('postgres', passwd), { uid: 102, gid: 104 });
    assert.equal(lookupSystemUser('nobody', passwd), null);
  });
});
