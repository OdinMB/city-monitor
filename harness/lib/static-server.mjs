/**
 * The run's web server: the built app from the run folder, any other path
 * answered with index.html (client-side routes), and /api/* passed to the
 * run's API on 127.0.0.1. It listens on 127.0.0.1 on a port it picks itself.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Which file under `root` answers `pathname`: the file itself, index.html for
 * a path without an extension, or null (404). Never a file outside `root`.
 */
export function resolveStaticFile(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const candidate = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
  const rel = path.relative(root, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  try {
    if (fs.statSync(candidate).isFile()) return candidate;
  } catch {
    // fall through
  }
  if (path.extname(decoded) === '') return path.join(root, 'index.html');
  return null;
}

export function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * Its own agent: Node's global agent follows HTTP_PROXY when the shell sets
 * NODE_USE_ENV_PROXY, and loopback requests must never take a proxy.
 */
export const loopbackAgent = new http.Agent({ keepAlive: false });

function proxyToApi(req, res, apiPort) {
  const headers = { ...req.headers, host: `127.0.0.1:${apiPort}` };
  const upstream = http.request(
    { host: '127.0.0.1', port: apiPort, method: req.method, path: req.url, headers, agent: loopbackAgent },
    (apiRes) => {
      res.writeHead(apiRes.statusCode ?? 502, apiRes.headers);
      apiRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('API unreachable');
  });
  req.pipe(upstream);
}

/** Starts the server; resolves with { server, port } once it listens on 127.0.0.1. */
export function startStaticServer({ root, apiPort }) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (isApiPath(pathname)) return proxyToApi(req, res, apiPort);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      return res.end();
    }
    const file = resolveStaticFile(root, pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address?.address !== '127.0.0.1') {
        server.close();
        return reject(new Error('the web server is not bound to 127.0.0.1'));
      }
      resolve({ server, port: address.port });
    });
  });
}

export function stopStaticServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}
