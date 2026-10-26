import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createApp } from './app.js';
import { CK } from './lib/cache-keys.js';

describe('createApp in synthetic mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('registers no jobs and makes no outbound requests', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const fetchSpy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);

    const { scheduler, cache } = await createApp({ synthetic: true });

    expect(scheduler.getJobs()).toEqual([]);
    expect(await scheduler.triggerJob('ingest-feeds')).toBe(false);
    // No RainViewer fetch from the weather tiles router
    expect(fetchSpy).not.toHaveBeenCalled();
    // The seeded placeholder names are not replaced with the hardcoded mayors
    expect(cache.get(CK.political('berlin', 'bezirke'))).toBeNull();
  });
});

describe('request bodies', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const { app } = await createApp({ synthetic: true });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('refuses a gzip-encoded JSON body with 415 and keeps serving', async () => {
    // Trailing bytes after the gzip member are the shape of GHSA-27r3-jxmh-p828
    const body = Buffer.concat([gzipSync(JSON.stringify({ a: 1 })), Buffer.from('trailing')]);
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body,
    });
    expect(res.status).toBe(415);

    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
  });

  it('refuses a JSON body over 10kb with 413', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(11 * 1024) }),
    });
    expect(res.status).toBe(413);
  });
});
