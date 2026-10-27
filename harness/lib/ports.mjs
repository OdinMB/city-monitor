/**
 * Loopback ports the harness picks itself: the system hands out a free one on
 * 127.0.0.1:0, the harness reads its number and releases it for the process
 * that needs a number up front (Postgres, the API, the closed proxy).
 */

import net from 'node:net';

function listenOnce() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** `count` distinct free ports on 127.0.0.1, all held until every one is picked. */
export async function pickFreePorts(count) {
  const servers = [];
  try {
    for (let i = 0; i < count; i += 1) servers.push(await listenOnce());
    return servers.map((server) => server.address().port);
  } finally {
    await Promise.all(servers.map(close));
  }
}

/** Resolves true when nothing accepts a connection on 127.0.0.1:`port`. */
export function isPortFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(true));
  });
}
