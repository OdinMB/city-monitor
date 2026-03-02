/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { SafetyReport } from '../cron/ingest-safety.js';

describe('Safety API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: ReturnType<typeof createApp>;

  beforeAll(async () => {
    appContext = createApp({ skipScheduler: true });
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

  it('GET /api/berlin/safety returns empty array when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/safety`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('GET /api/berlin/safety returns cached reports', async () => {
    const mockReports: SafetyReport[] = [
      { id: '1', title: 'Test report', description: 'Test', publishedAt: '2026-03-01T10:00:00Z', url: 'https://example.com', district: 'Mitte' },
    ];
    appContext.cache.set('berlin:safety:recent', mockReports, 60);

    const res = await fetch(`${baseUrl}/api/berlin/safety`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].district).toBe('Mitte');
  });

  it('GET /api/unknown/safety returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/safety`);
    expect(res.status).toBe(404);
  });
});
