import { describe, expect, it, vi } from 'vitest';
import { describeMigrationError, errorCode, isConnectionError, runWithRetry } from './migrate.js';

function coded(code: string, message = 'boom'): Error {
  return Object.assign(new Error(message), { code });
}

describe('errorCode', () => {
  it('finds a code wrapped in a cause', () => {
    const wrapped = new Error('Failed query', { cause: coded('42P07') });
    expect(errorCode(wrapped)).toBe('42P07');
  });

  it('returns undefined without a code', () => {
    expect(errorCode(new Error('x'))).toBeUndefined();
    expect(errorCode('x')).toBeUndefined();
  });
});

describe('isConnectionError', () => {
  it('treats a connect timeout and a refused connection as connection errors', () => {
    expect(isConnectionError(coded('CONNECT_TIMEOUT'))).toBe(true);
    expect(isConnectionError(new Error('wrap', { cause: coded('ECONNREFUSED') }))).toBe(true);
  });

  it('does not treat a SQL error as a connection error', () => {
    expect(isConnectionError(coded('42703'))).toBe(false);
    expect(isConnectionError(coded('55P03'))).toBe(false); // lock_not_available
  });
});

describe('describeMigrationError', () => {
  it('includes the Postgres code, detail and statement', () => {
    const pg = Object.assign(new Error('column "x" already exists'), { code: '42701', detail: 'd', hint: 'h' });
    const wrapped = Object.assign(new Error('Failed query: ALTER TABLE t ADD x', { cause: pg }), {
      query: 'ALTER TABLE t ADD x',
    });
    const text = describeMigrationError(wrapped);
    expect(text).toContain('42701');
    expect(text).toContain('column "x" already exists');
    expect(text).toContain('detail: d');
    expect(text).toContain('hint: h');
    expect(text).toContain('statement: ALTER TABLE t ADD x');
  });
});

describe('runWithRetry', () => {
  const quiet = { log: () => {}, sleep: async () => {} };

  it('retries connection errors and returns the first success', async () => {
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(coded('CONNECT_TIMEOUT'))
      .mockRejectedValueOnce(coded('ECONNREFUSED'))
      .mockResolvedValue('ok');
    await expect(runWithRetry(attempt, { ...quiet, attempts: 5 })).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('does not retry a SQL error', async () => {
    const attempt = vi.fn<() => Promise<string>>().mockRejectedValue(coded('42703'));
    await expect(runWithRetry(attempt, { ...quiet, attempts: 5 })).rejects.toMatchObject({ code: '42703' });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last attempt with the last error', async () => {
    const attempt = vi.fn<() => Promise<string>>().mockRejectedValue(coded('CONNECT_TIMEOUT'));
    await expect(runWithRetry(attempt, { ...quiet, attempts: 3 })).rejects.toMatchObject({ code: 'CONNECT_TIMEOUT' });
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('doubles the delay between attempts', async () => {
    const sleep = vi.fn(async () => {});
    const attempt = vi.fn<() => Promise<string>>().mockRejectedValue(coded('ECONNRESET'));
    await expect(runWithRetry(attempt, { log: () => {}, sleep, attempts: 4, baseDelayMs: 1000 })).rejects.toThrow();
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([1000, 2000, 4000]);
  });
});
