/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

describe('Political API', () => {
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

  it('GET /api/berlin/political/bundestag returns empty array when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/political/bundestag`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/political/state returns cached data', async () => {
    const mockData = [
      {
        id: 'state-mitte',
        name: 'Mitte',
        level: 'landesparlament',
        representatives: [
          { name: 'Max Mustermann', party: 'SPD', role: 'MdA', constituency: 'Mitte 1' },
        ],
      },
    ];
    appContext.cache.set('berlin:political:state', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/political/state`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].representatives[0].party).toBe('SPD');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/berlin/political/invalid returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/political/invalid`);
    expect(res.status).toBe(400);
  });

  it('GET /api/unknown/political/bundestag returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/political/bundestag`);
    expect(res.status).toBe(404);
  });
});
