/**
 * Temporary diagnostic for the `trust proxy` hop count (TRUST_PROXY_HOPS in
 * app.ts): describes how the app sees the caller's own request. Remove it,
 * with routes/connection-check.ts, once the count is set from the measurement.
 */
import type { Request } from 'express';

/** TEST-NET-3 (RFC 5737): documentation only, so no visitor or proxy has it. */
export const FORGED_ADDRESS = '203.0.113.7';

export interface ConnectionCandidate {
  hops: number;
  address: string | null;
}

export interface ConnectionReport {
  /** What req.ip, and so every per-IP rate limit, counts by */
  address: string | null;
  /** The configured `trust proxy` hop count */
  trustProxy: number;
  /** The socket's address: the nearest proxy, or the caller when there is none */
  connectionAddress: string | null;
  /** The raw X-Forwarded-For chain, left to right */
  forwardedFor: string[];
  /** For each hop count from 0 to the chain's length, the address that count would give */
  candidates: ConnectionCandidate[];
  host: string | null;
  protocol: string;
}

export function describeConnection(req: Request, trustProxy: number): ConnectionReport {
  const header = req.headers['x-forwarded-for'];
  const forwardedFor = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e !== '');
  const connectionAddress = req.socket.remoteAddress ?? null;
  return {
    address: req.ip ?? null,
    trustProxy,
    connectionAddress,
    forwardedFor,
    candidates: [connectionAddress, ...[...forwardedFor].reverse()].map((address, hops) => ({ hops, address })),
    host: req.headers.host ?? null,
    protocol: req.protocol,
  };
}

export type ConnectionVerdict =
  | { kind: 'right'; configured: number; correct: number }
  | { kind: 'too-high'; configured: number; correct: number }
  | { kind: 'too-low'; configured: number; correct: number }
  | { kind: 'header-removed'; configured: number };

/**
 * Reads the answer to a request sent with `X-Forwarded-For: <forged>`. The
 * proxies append to that header, so the forged entry sits just left of the
 * caller's real address, and the correct count is its hop index minus one.
 * Candidates run from the right, so the first match is the rightmost forged
 * entry. No match means something in front removed the header: the count
 * cannot be read from this answer.
 *
 * The check page runs this in the browser through toString()
 * (routes/connection-check.ts), so it stays self-contained: no imports, no
 * outside references, no inner functions.
 */
export function connectionVerdict(
  report: Pick<ConnectionReport, 'trustProxy' | 'candidates'>,
  forged: string,
): ConnectionVerdict {
  const configured = report.trustProxy;
  for (const candidate of report.candidates) {
    if (candidate.hops > 0 && candidate.address === forged) {
      const correct = candidate.hops - 1;
      if (configured === correct) return { kind: 'right', configured, correct };
      return { kind: configured > correct ? 'too-high' : 'too-low', configured, correct };
    }
  }
  return { kind: 'header-removed', configured };
}
