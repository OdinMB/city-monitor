/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

describe('Weather Tiles Proxy', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: Awaited<ReturnType<typeof createApp>>;
  const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

  beforeAll(async () => {
    vi.stubEnv('OPENWEATHERMAP_API_KEY', 'test-key-123');
    appContext = await createApp({ skipScheduler: true });
    await new Promise<void>((resolve) => {
      server = appContext.app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('proxies valid tile requests to OpenWeatherMap', async () => {
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(baseUrl)) return originalFetch(input, init);
      // Verify the upstream URL is correct
      expect(url).toContain('tile.openweathermap.org/map/clouds_new/');
      expect(url).toContain('appid=test-key-123');
      return Promise.resolve(new Response(FAKE_PNG, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }));
    });

    const res = await fetch(`${baseUrl}/api/weather-tiles/10/550/335.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');

    vi.restoreAllMocks();
  });

  it('rejects non-integer tile coordinates', async () => {
    const res = await fetch(`${baseUrl}/api/weather-tiles/abc/550/335.png`);
    expect(res.status).toBe(400);
  });

  it('rejects negative zoom levels', async () => {
    const res = await fetch(`${baseUrl}/api/weather-tiles/-1/550/335.png`);
    expect(res.status).toBe(400);
  });

  it('rejects zoom levels above 19', async () => {
    const res = await fetch(`${baseUrl}/api/weather-tiles/20/550/335.png`);
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range tile coordinates', async () => {
    // At zoom 2, valid x/y range is 0..3
    const res = await fetch(`${baseUrl}/api/weather-tiles/2/4/0.png`);
    expect(res.status).toBe(400);
  });

  it('returns 503 when API key is not configured', async () => {
    vi.stubEnv('OPENWEATHERMAP_API_KEY', '');
    const res = await fetch(`${baseUrl}/api/weather-tiles/10/550/335.png`);
    expect(res.status).toBe(503);
    vi.stubEnv('OPENWEATHERMAP_API_KEY', 'test-key-123');
  });

  it('returns 503 when OWM rejects API key (401)', async () => {
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(baseUrl)) return originalFetch(input, init);
      return Promise.resolve(new Response('{"cod":401}', { status: 401 }));
    });

    const res = await fetch(`${baseUrl}/api/weather-tiles/10/550/335.png`);
    expect(res.status).toBe(503);

    vi.restoreAllMocks();
  });

  it('returns 502 when upstream fails', async () => {
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(baseUrl)) return originalFetch(input, init);
      return Promise.resolve(new Response('', { status: 500 }));
    });

    const res = await fetch(`${baseUrl}/api/weather-tiles/10/550/335.png`);
    expect(res.status).toBe(502);

    vi.restoreAllMocks();
  });
});
