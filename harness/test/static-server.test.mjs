import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { isApiPath, resolveStaticFile, startStaticServer, stopStaticServer } from '../lib/static-server.mjs';

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', reject);
  });
}

describe('resolveStaticFile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  fs.writeFileSync(path.join(root, 'index.html'), 'index');
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'app.js'), 'js');

  it('serves files, falls back to index.html for routes and 404s missing assets', () => {
    assert.equal(resolveStaticFile(root, '/assets/app.js'), path.join(root, 'assets', 'app.js'));
    assert.equal(resolveStaticFile(root, '/berlin'), path.join(root, 'index.html'));
    assert.equal(resolveStaticFile(root, '/'), path.join(root, 'index.html'));
    assert.equal(resolveStaticFile(root, '/assets/missing.js'), null);
  });

  it('never leaves the root', () => {
    for (const p of ['/../../etc/passwd', '/..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/etc/passwd']) {
      const file = resolveStaticFile(root, p);
      assert.ok(file === null || file.startsWith(root), p);
    }
    assert.equal(resolveStaticFile(root, '/%E0%A4%A'), null);
    assert.equal(resolveStaticFile(root, '/a%00.js'), null);
  });

  it('knows the API paths', () => {
    assert.equal(isApiPath('/api'), true);
    assert.equal(isApiPath('/api/berlin/bootstrap'), true);
    assert.equal(isApiPath('/apix'), false);
  });

  it('serves the app and passes /api to the run\'s API, on 127.0.0.1', async () => {
    const api = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, host: req.headers.host }));
    });
    await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
    const apiPort = api.address().port;
    const { server, port } = await startStaticServer({ root, apiPort });
    try {
      assert.equal(server.address().address, '127.0.0.1');
      const page = await get(port, '/berlin');
      assert.equal(page.status, 200);
      assert.equal(page.body, 'index');
      assert.match(page.type, /text\/html/);
      const js = await get(port, '/assets/app.js');
      assert.match(js.type, /javascript/);
      const proxied = await get(port, '/api/health?x=1');
      assert.deepEqual(JSON.parse(proxied.body), { path: '/api/health?x=1', host: `127.0.0.1:${apiPort}` });
      assert.equal((await get(port, '/assets/missing.js')).status, 404);
    } finally {
      await stopStaticServer(server);
      await new Promise((resolve) => api.close(resolve));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
