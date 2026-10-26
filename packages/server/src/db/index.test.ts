import { describe, it, expect, vi, afterEach } from 'vitest';
// Static, not `await import()` in the test: loading Drizzle, postgres and the
// schema inside the test overran its 5 s timeout on a busy machine. createDb()
// reads DATABASE_URL when called, so a fresh module is not needed.
import { createDb } from './index.js';

describe('createDb', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns null when DATABASE_URL is not set', () => {
    vi.stubEnv('DATABASE_URL', '');
    const db = createDb();
    expect(db).toBeNull();
  });
});
