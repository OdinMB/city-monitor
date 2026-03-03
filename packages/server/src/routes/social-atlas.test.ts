/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

describe('Social Atlas API', () => {
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

  it('GET /api/berlin/social-atlas returns null when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/social-atlas`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/social-atlas returns cached GeoJSON', async () => {
    const mockGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: [] },
          properties: { plrId: '01010101', plrName: 'Test Area', statusIndex: 2 },
        },
      ],
    };
    appContext.cache.set('berlin:social-atlas:geojson', mockGeoJson, 60);

    const res = await fetch(`${baseUrl}/api/berlin/social-atlas`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.type).toBe('FeatureCollection');
    expect(body.data.features).toHaveLength(1);
    expect(body.data.features[0].properties.plrId).toBe('01010101');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/unknown/social-atlas returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/social-atlas`);
    expect(res.status).toBe(404);
  });

});
