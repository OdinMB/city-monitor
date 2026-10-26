import { describe, it, expect } from 'vitest';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runInNewContext } from 'node:vm';
import express from 'express';
import {
  connectionVerdict,
  describeConnection,
  FORGED_ADDRESS,
  type ConnectionReport,
} from './connection-check.js';

// A visitor behind three proxies
const VISITOR = '198.51.100.23';
const CHAIN = [VISITOR, '172.16.0.2', '10.0.0.3'];
const SOCKET = '127.0.0.1';

/** Sends one request to an app with `trust proxy` at `hops` and returns its description. */
async function report(hops: number, forwardedFor?: string | string[]): Promise<ConnectionReport> {
  const app = express();
  app.set('trust proxy', hops);
  app.get('/', (req, res) => { res.json(describeConnection(req, hops)); });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, SOCKET, () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    return await new Promise<ConnectionReport>((resolve, reject) => {
      const req = http.request({ host: SOCKET, port, path: '/' }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      if (forwardedFor !== undefined) req.setHeader('X-Forwarded-For', forwardedFor);
      req.end();
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('describeConnection', () => {
  it('derives the address the hop count names', async () => {
    expect((await report(0, CHAIN.join(', '))).address).toBe(SOCKET);
    expect((await report(1, CHAIN.join(', '))).address).toBe('10.0.0.3');
    expect((await report(3, CHAIN.join(', '))).address).toBe(VISITOR);
  });

  it('returns the chain as sent and one candidate per hop count, each equal to the address at that count', async () => {
    for (const hops of [0, 1, 2, 3]) {
      const r = await report(hops, CHAIN.join(', '));
      expect(r.trustProxy).toBe(hops);
      expect(r.connectionAddress).toBe(SOCKET);
      expect(r.forwardedFor).toEqual(CHAIN);
      expect(r.candidates).toEqual([
        { hops: 0, address: SOCKET },
        { hops: 1, address: '10.0.0.3' },
        { hops: 2, address: '172.16.0.2' },
        { hops: 3, address: VISITOR },
      ]);
      expect(r.candidates[hops].address).toBe(r.address);
    }
  });

  it('takes the forged entry only at one count above the right one', async () => {
    const forged = [FORGED_ADDRESS, ...CHAIN].join(', ');
    expect((await report(3, forged)).address).toBe(VISITOR);
    expect((await report(4, forged)).address).toBe(FORGED_ADDRESS);
    // Without the forged entry a count of 4 looks right, which is why the check forges
    expect((await report(4, CHAIN.join(', '))).address).toBe(VISITOR);
  });

  it('combines repeated header lines in order', async () => {
    const r = await report(3, [VISITOR, '172.16.0.2, 10.0.0.3']);
    expect(r.forwardedFor).toEqual(CHAIN);
    expect(r.address).toBe(VISITOR);
  });

  it('has only the socket as candidate when no header arrives', async () => {
    const r = await report(1);
    expect(r.forwardedFor).toEqual([]);
    expect(r.candidates).toEqual([{ hops: 0, address: SOCKET }]);
    expect(r.address).toBe(SOCKET);
  });

  it('returns exactly the documented keys', async () => {
    const r = await report(1, CHAIN.join(', '));
    expect(Object.keys(r).sort()).toEqual(
      ['address', 'candidates', 'connectionAddress', 'forwardedFor', 'host', 'protocol', 'trustProxy'],
    );
    expect(r.host).toMatch(/^127\.0\.0\.1:\d+$/);
    expect(r.protocol).toBe('http');
  });
});

/** The candidates describeConnection gives for this socket and chain. */
function candidates(socket: string, chain: string[]) {
  return [socket, ...[...chain].reverse()].map((address, hops) => ({ hops, address }));
}

describe('connectionVerdict', () => {
  // Behind three proxies, with the forged entry sent by the caller
  const behindThree = candidates('10.0.0.4', [FORGED_ADDRESS, ...CHAIN]);

  it('calls the right count right', () => {
    expect(connectionVerdict({ trustProxy: 3, candidates: behindThree }, FORGED_ADDRESS))
      .toEqual({ kind: 'right', configured: 3, correct: 3 });
  });

  it.each([4, 7])('calls %i too high, correct 3', (trustProxy) => {
    expect(connectionVerdict({ trustProxy, candidates: behindThree }, FORGED_ADDRESS))
      .toEqual({ kind: 'too-high', configured: trustProxy, correct: 3 });
  });

  it.each([2, 0])('calls %i too low, correct 3', (trustProxy) => {
    expect(connectionVerdict({ trustProxy, candidates: behindThree }, FORGED_ADDRESS))
      .toEqual({ kind: 'too-low', configured: trustProxy, correct: 3 });
  });

  it('with no proxy in front, calls 0 right and 1 too high', () => {
    const direct = candidates(VISITOR, [FORGED_ADDRESS]);
    expect(connectionVerdict({ trustProxy: 0, candidates: direct }, FORGED_ADDRESS))
      .toEqual({ kind: 'right', configured: 0, correct: 0 });
    expect(connectionVerdict({ trustProxy: 1, candidates: direct }, FORGED_ADDRESS))
      .toEqual({ kind: 'too-high', configured: 1, correct: 0 });
  });

  it('reports the header removed when the forged entry is missing, or there is no chain', () => {
    expect(connectionVerdict({ trustProxy: 1, candidates: candidates('10.0.0.4', CHAIN) }, FORGED_ADDRESS))
      .toEqual({ kind: 'header-removed', configured: 1 });
    expect(connectionVerdict({ trustProxy: 1, candidates: candidates('10.0.0.4', []) }, FORGED_ADDRESS))
      .toEqual({ kind: 'header-removed', configured: 1 });
  });

  it('lets the rightmost forged entry decide when there are two', () => {
    const twice = candidates('10.0.0.4', [FORGED_ADDRESS, FORGED_ADDRESS, ...CHAIN]);
    expect(connectionVerdict({ trustProxy: 3, candidates: twice }, FORGED_ADDRESS))
      .toEqual({ kind: 'right', configured: 3, correct: 3 });
  });

  it('runs on its own, as the check page inlines it', () => {
    const standalone = runInNewContext(`(${connectionVerdict.toString()})`) as typeof connectionVerdict;
    const verdict = standalone({ trustProxy: 4, candidates: behindThree }, FORGED_ADDRESS);
    expect(JSON.parse(JSON.stringify(verdict))).toEqual({ kind: 'too-high', configured: 4, correct: 3 });
  });
});
