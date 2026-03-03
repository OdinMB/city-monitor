/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { NewsSummary } from '../cron/summarize.js';

describe('Summary API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
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
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/berlin/news/summary returns null when no summary', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/news/summary`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.briefing).toBeNull();
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/news/summary returns cached summary', async () => {
    const mockSummary: NewsSummary = {
      briefing: 'Berlin saw major transit disruptions today.',
      generatedAt: '2026-03-02T10:00:00Z',
      headlineCount: 10,
      cached: true,
    };
    appContext.cache.set('berlin:news:summary', mockSummary, 60);

    const res = await fetch(`${baseUrl}/api/berlin/news/summary`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.briefing).toBe('Berlin saw major transit disruptions today.');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/news/summary returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/news/summary`);
    expect(res.status).toBe(404);
  });
});
