/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

describe('Pharmacies API', () => {
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

  it('GET /api/berlin/pharmacies returns empty array when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/pharmacies`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/pharmacies returns cached data', async () => {
    const mockData = [
      {
        id: 'apo-berlin-0',
        name: 'Stern-Apotheke',
        address: 'Hauptstr. 1, 10827 Berlin',
        phone: '030-1234567',
        location: { lat: 52.49, lon: 13.35 },
        validFrom: '2026-03-02T08:00:00',
        validUntil: '2026-03-03T08:00:00',
        distance: 2.3,
      },
    ];
    appContext.cache.set('berlin:pharmacies:emergency', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/pharmacies`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Stern-Apotheke');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/pharmacies returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/pharmacies`);
    expect(res.status).toBe(404);
  });
});
