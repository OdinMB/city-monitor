import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { runInNewContext } from 'node:vm';
import { createApp, TRUST_PROXY_HOPS } from '../app.js';
import { connectionVerdict, FORGED_ADDRESS } from '../lib/connection-check.js';

describe('Connection check API', () => {
  let server: Server;
  let baseUrl: string;
  let configured: unknown;

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const { app } = await createApp({ synthetic: true });
    configured = app.get('trust proxy');
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

  it('GET /api/connection-check describes the request with exactly the documented keys, uncached', async () => {
    const res = await fetch(`${baseUrl}/api/connection-check`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');

    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['address', 'candidates', 'connectionAddress', 'forwardedFor', 'host', 'protocol', 'trustProxy'],
    );
    expect(body.trustProxy).toBe(TRUST_PROXY_HOPS);
    expect(body.trustProxy).toBe(configured);
    expect(body.forwardedFor).toEqual([]);
    expect(body.candidates).toEqual([{ hops: 0, address: body.connectionAddress }]);
    expect(body.address).toBe(body.connectionAddress);
  });

  it('reads a direct call with the forged header as having no proxy in front', async () => {
    const res = await fetch(`${baseUrl}/api/connection-check`, { headers: { 'X-Forwarded-For': FORGED_ADDRESS } });
    const body = await res.json();
    expect(body.forwardedFor).toEqual([FORGED_ADDRESS]);
    expect(connectionVerdict(body, FORGED_ADDRESS)).toMatchObject({ configured: TRUST_PROXY_HOPS, correct: 0 });
  });

  it('serves the page with its script as a same-origin file, which the default CSP allows', async () => {
    const res = await fetch(`${baseUrl}/api/connection-check/page`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");

    const html = await res.text();
    expect(html).toContain('<script src="/api/connection-check/page.js"></script>');
    // Inline script would be blocked by the CSP
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);

    const script = await fetch(`${baseUrl}/api/connection-check/page.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toMatch(/javascript/);
    expect(script.headers.get('cache-control')).toBe('no-store');
    expect(await script.text()).toContain(connectionVerdict.toString());
  });

  it('runs the page script against the API and shows the verdict', async () => {
    const html = await (await fetch(`${baseUrl}/api/connection-check/page`)).text();
    const script = await (await fetch(`${baseUrl}/api/connection-check/page.js`)).text();

    const shown = new Map<string, string>();
    const sent: { url: string; headers: Record<string, string> }[] = [];
    const context = {
      location: { host: 'check.test' },
      document: {
        getElementById: (id: string) => {
          // Every element the script writes must exist on the page
          if (!html.includes(`id="${id}"`)) throw new Error(`no element #${id}`);
          return { set textContent(text: string) { shown.set(id, text); } };
        },
      },
      fetch: (url: string, init: { headers: Record<string, string> }) => {
        sent.push({ url, headers: init.headers });
        return fetch(`${baseUrl}${url}`, init);
      },
    };
    runInNewContext(script, context);

    await vi.waitFor(() => expect(shown.get('raw')).toBeDefined());
    // Called directly, nothing is in front, so the correct count is 0
    expect(shown.get('verdict')).toMatch(/^(Right: 0 |Too high \(\d+\): set it to 0\.)/);
    expect(shown.get('host')).toBe('check.test');
    expect(shown.get('configured')).toBe(String(TRUST_PROXY_HOPS));
    expect(shown.get('chain-plain')).toBe('(none arrived)');
    expect(shown.get('chain-forged')).toBe(FORGED_ADDRESS);

    expect(sent).toHaveLength(2);
    expect(sent[0].headers).toEqual({});
    expect(sent[1].headers).toEqual({ 'X-Forwarded-For': FORGED_ADDRESS });
    // Each request carries its own query string, so no shared cache can mix them up
    expect(sent[0].url).toMatch(/^\/api\/connection-check\?n=\w+$/);
    expect(sent[0].url).not.toBe(sent[1].url);
  });
});
