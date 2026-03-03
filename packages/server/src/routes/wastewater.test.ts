/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { WastewaterSummary } from '@city-monitor/shared';

describe('Wastewater API', () => {
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

  it('GET /api/berlin/wastewater returns null when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/wastewater`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/wastewater returns cached summary', async () => {
    const mockSummary: WastewaterSummary = {
      sampleDate: '2025-12-14',
      pathogens: [
        { name: 'Influenza A', value: 45000, previousValue: 15000, trend: 'rising', level: 'high', history: [15000, 45000] },
        { name: 'Influenza B', value: 2000, previousValue: 2000, trend: 'stable', level: 'moderate', history: [2000, 2000] },
        { name: 'RSV', value: 0, previousValue: 500, trend: 'gone', level: 'none', history: [500, 0] },
      ],
      plantCount: 3,
    };
    appContext.cache.set('berlin:wastewater:summary', mockSummary, 60);

    const res = await fetch(`${baseUrl}/api/berlin/wastewater`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.sampleDate).toBe('2025-12-14');
    expect(body.data.pathogens).toHaveLength(3);
    expect(body.data.plantCount).toBe(3);
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/wastewater returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/wastewater`);
    expect(res.status).toBe(404);
  });
});
