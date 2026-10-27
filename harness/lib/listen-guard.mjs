/**
 * Keeps a server in the API process on 127.0.0.1. dev-synthetic.ts calls
 * app.listen(port), which Node binds on every interface; the harness adds the
 * loopback host instead of changing product code, and refuses any other host.
 */

import net from 'node:net';

const LOOPBACK = '127.0.0.1';

function isPort(value) {
  return (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^\d+$/.test(value));
}

/**
 * The arguments for net.Server#listen with the host forced to 127.0.0.1, or
 * a thrown Error for a host other than loopback, a Unix socket path or a handle.
 */
export function loopbackListenArgs(args) {
  if (args.length === 0 || typeof args[0] === 'function') return [0, LOOPBACK, ...args];
  const [first, second, ...rest] = args;
  if (isPort(first)) {
    if (second === undefined || typeof second === 'function') return [first, LOOPBACK, ...args.slice(1)];
    if (typeof second === 'string') {
      if (second === LOOPBACK || second === 'localhost') return [first, LOOPBACK, ...rest];
      throw new Error(`the harness keeps servers on ${LOOPBACK}; refused host ${second}`);
    }
    if (typeof second === 'number') return [first, LOOPBACK, ...args.slice(1)]; // (port, backlog, cb)
  }
  if (first && typeof first === 'object' && !('_handle' in first) && !('fd' in first) && first.path === undefined) {
    const host = first.host;
    if (host === undefined || host === LOOPBACK || host === 'localhost') return [{ ...first, host: LOOPBACK }, ...args.slice(1)];
    throw new Error(`the harness keeps servers on ${LOOPBACK}; refused host ${host}`);
  }
  throw new Error('the harness keeps servers on a 127.0.0.1 port; refused a socket path or handle');
}

/**
 * Patches net.Server#listen in this process. `onListening(server)` runs once
 * each server is bound, to check and report its address.
 */
export function enforceLoopbackListen(onListening) {
  const original = net.Server.prototype.listen;
  net.Server.prototype.listen = function listen(...args) {
    const fixed = loopbackListenArgs(args);
    this.once('listening', () => onListening(this));
    return original.apply(this, fixed);
  };
  return () => {
    net.Server.prototype.listen = original;
  };
}
