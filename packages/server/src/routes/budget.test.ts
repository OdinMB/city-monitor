/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { BudgetSummary } from '@city-monitor/shared';

describe('Budget API', () => {
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

  it('GET /api/berlin/budget returns null when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/budget`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/budget returns cached data', async () => {
    const mockData: BudgetSummary = {
      year: '2026',
      areas: [{
        areaCode: -1,
        areaName: 'Berlin (Total)',
        revenues: [{ code: 1, name: 'Education', amount: 5_000_000 }],
        expenses: [{ code: 1, name: 'Education', amount: 8_000_000 }],
        totalRevenue: 5_000_000,
        totalExpense: 8_000_000,
      }],
      fetchedAt: '2026-03-01T00:00:00.000Z',
    };
    appContext.cache.set('berlin:budget', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/budget`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.year).toBe('2026');
    expect(body.data.areas).toHaveLength(1);
    expect(body.data.areas[0].areaName).toBe('Berlin (Total)');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/budget returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/budget`);
    expect(res.status).toBe(404);
  });
});
