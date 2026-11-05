export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

// Matches: token=, key=, apikey=, api_key=, api_token=, and bracket-encoded
// variants like something%5Btoken%5D= or something[key]=
const SENSITIVE_PARAMS = /([?&](?:[^=]*(?:%5B|\[)(?:token|key)(?:%5D|\])|token|key|apikey|api_key|api[-_]?token)=)[^&]*/gi;

function sanitizeUrl(url: string): string {
  return url.replace(SENSITIVE_PARAMS, '$1***');
}

function truncateUrl(url: string, maxLen = 80): string {
  const safe = sanitizeUrl(url);
  return safe.length > maxLen ? safe.slice(0, maxLen) + '…' : safe;
}

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  cause?: unknown;
  errors?: unknown;
}

/**
 * One line saying why something failed, down the cause chain. fetch() throws
 * a bare "fetch failed" whose reason sits in `cause`, often an AggregateError
 * with one connect error per address tried; printed as an object that showed
 * up in the logs as `[errors]: [ [Error], [Error] ]`, which says nothing.
 */
export function describeError(err: unknown, depth = 0): string {
  if (typeof err !== 'object' || err === null) return String(err);
  const e = err as ErrorLike;
  if (e.name === 'TimeoutError') return 'timed out';
  if (Array.isArray(e.errors) && e.errors.length > 0 && depth < 4) {
    return e.errors.map((x) => describeError(x, depth + 1)).join(', ');
  }
  const message = typeof e.message === 'string' && e.message ? e.message : String(e.name ?? 'error');
  const code = typeof e.code === 'string' ? e.code : '';
  const self = code && !message.includes(code) ? `${code} ${message}` : message;
  if (e.cause !== undefined && e.cause !== null && depth < 4) return `${self}: ${describeError(e.cause, depth + 1)}`;
  return self;
}

/** A timeout, an abort or a connection that never got an answer: its stack says nothing. */
function isNetworkFailure(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as ErrorLike;
  return e.name === 'TimeoutError' || e.name === 'AbortError' || (e.name === 'TypeError' && e.message === 'fetch failed');
}

export function createLogger(tag: string): Logger {
  const prefix = () => `${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')} [${tag}]`;

  return {
    info(msg: string) {
      console.log(`${prefix()} ${msg}`);
    },

    warn(msg: string) {
      console.warn(`${prefix()} WARN: ${msg}`);
    },

    error(msg: string, err?: unknown) {
      if (err === undefined) {
        console.error(`${prefix()} ERROR: ${msg}`);
        return;
      }
      console.error(`${prefix()} ERROR: ${msg} — ${describeError(err)}`);
      if (!isNetworkFailure(err)) console.error(err);
    },

    async fetch(url: string, init?: RequestInit): Promise<Response> {
      const start = performance.now();
      const display = truncateUrl(url);
      try {
        const response = await globalThis.fetch(url, init);
        const ms = Math.round(performance.now() - start);
        if (response.ok) {
          console.log(`${prefix()} FETCH ${display} → ${response.status} (${ms}ms)`);
        } else {
          console.warn(`${prefix()} FETCH ${display} → ${response.status} (${ms}ms)`);
        }
        return response;
      } catch (err) {
        const ms = Math.round(performance.now() - start);
        console.error(`${prefix()} FETCH ${display} → ERROR (${ms}ms): ${describeError(err)}`);
        throw err;
      }
    },
  };
}
