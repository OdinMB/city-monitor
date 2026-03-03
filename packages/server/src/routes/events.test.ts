/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { CityEvent } from '../cron/ingest-events.js';

describe('Events API', () => {
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

  it('GET /api/berlin/events returns empty array when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/events`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/events returns cached events', async () => {
    const mockEvents: CityEvent[] = [
      { id: '1', title: 'Test Event', venue: 'Philharmonie', date: '2099-12-31T19:00:00Z', category: 'music', url: 'https://example.com', source: 'kulturdaten' },
    ];
    appContext.cache.set('berlin:events:upcoming', mockEvents, 60);

    const res = await fetch(`${baseUrl}/api/berlin/events`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].venue).toBe('Philharmonie');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/events returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/events`);
    expect(res.status).toBe(404);
  });
});
