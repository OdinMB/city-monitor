/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { LaborMarketSummary } from '@city-monitor/shared';

describe('Labor Market API', () => {
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

  it('GET /api/berlin/labor-market returns null when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/labor-market`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toBeNull();
  });

  it('GET /api/berlin/labor-market returns cached summary', async () => {
    const mockSummary: LaborMarketSummary = {
      unemploymentRate: 10.6,
      totalUnemployed: 226880,
      yoyChangeAbsolute: 11460,
      yoyChangePercent: 5,
      sgbIIRate: 7.0,
      sgbIICount: 148600,
      sgbIIYoyAbsolute: 5000,
      sgbIIYoyPercent: 3,
      reportMonth: '2026-02',
    };
    appContext.cache.set('berlin:labor-market', mockSummary, 60);

    const res = await fetch(`${baseUrl}/api/berlin/labor-market`);
    const body = await res.json() as LaborMarketSummary;
    expect(res.status).toBe(200);
    expect(body.unemploymentRate).toBe(10.6);
    expect(body.totalUnemployed).toBe(226880);
    expect(body.reportMonth).toBe('2026-02');
  });

  it('GET /api/unknown/labor-market returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/labor-market`);
    expect(res.status).toBe(404);
  });
});
