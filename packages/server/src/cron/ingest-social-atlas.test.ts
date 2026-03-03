/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createSocialAtlasIngestion } from './ingest-social-atlas.js';

// Mock WFS response for index indicators layer (mss2023_indexind_542)
const mockIndexIndResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [[[[13.3, 52.5], [13.31, 52.5], [13.31, 52.51], [13.3, 52.51], [13.3, 52.5]]]] },
      properties: {
        plr_id: '01010101', plr_name: 'Tiergarten-Süd', bez_id: '01',
        ew: 10000, kom: 'gültig', zeit: 202212,
        s1: 8.5, s2: 20.0, s3: 12.0, s4: 25.0,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [[[[13.4, 52.5], [13.41, 52.5], [13.41, 52.51], [13.4, 52.51], [13.4, 52.5]]]] },
      properties: {
        plr_id: '08010101', plr_name: 'Neukölln-Nord', bez_id: '08',
        ew: 20000, kom: 'gültig', zeit: 202212,
        s1: 14.2, s2: 30.0, s3: 22.0, s4: 40.0,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [[[[13.2, 52.5], [13.21, 52.5], [13.21, 52.51], [13.2, 52.51], [13.2, 52.5]]]] },
      properties: {
        plr_id: '04010101', plr_name: 'Grunewald', bez_id: '04',
        ew: 5000, kom: 'gültig', zeit: 202212,
        s1: 3.0, s2: 10.0, s3: 5.0, s4: 8.0,
      },
    },
    {
      // Invalid feature — should be filtered out
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [[[[13.5, 52.5], [13.51, 52.5], [13.51, 52.51], [13.5, 52.51], [13.5, 52.5]]]] },
      properties: {
        plr_id: '99990101', plr_name: 'Unbewohnt', bez_id: '99',
        ew: 0, kom: 'nicht bewohnt', zeit: 202212,
        s1: null, s2: null, s3: null, s4: null,
      },
    },
  ],
};

// Mock WFS response for composite indices layer (mss2023_indizes_542)
const mockIndizesResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: null,
      properties: { plr_id: '01010101', si_n: 2, si_v: 'mittel' },
    },
    {
      type: 'Feature',
      geometry: null,
      properties: { plr_id: '08010101', si_n: 4, si_v: 'sehr niedrig' },
    },
    {
      type: 'Feature',
      geometry: null,
      properties: { plr_id: '04010101', si_n: 1, si_v: 'hoch' },
    },
    {
      type: 'Feature',
      geometry: null,
      properties: { plr_id: '99990101', si_n: null, si_v: null },
    },
  ],
};

function mockFetchResponses() {
  let callCount = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('indexind')) {
      return new Response(JSON.stringify(mockIndexIndResponse), { status: 200 });
    }
    if (urlStr.includes('indizes')) {
      return new Response(JSON.stringify(mockIndizesResponse), { status: 200 });
    }
    callCount++;
    // Return the appropriate response based on call order as fallback
    if (callCount === 1) return new Response(JSON.stringify(mockIndexIndResponse), { status: 200 });
    return new Response(JSON.stringify(mockIndizesResponse), { status: 200 });
  });
}

describe('ingest-social-atlas', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches both WFS layers and caches GeoJSON', async () => {
    mockFetchResponses();

    const cache = createCache();
    const ingest = createSocialAtlasIngestion(cache);
    await ingest();

    const geojson = cache.get<{ type: string; features: Array<{ type: string; geometry: unknown; properties: Record<string, unknown> }> }>('berlin:social-atlas:geojson');
    expect(geojson).toBeTruthy();
    expect(geojson!.type).toBe('FeatureCollection');
    // Only 3 valid features (the "nicht bewohnt" one filtered out)
    expect(geojson!.features).toHaveLength(3);
  });

  it('joins indicators with composite index on plr_id', async () => {
    mockFetchResponses();

    const cache = createCache();
    const ingest = createSocialAtlasIngestion(cache);
    await ingest();

    const geojson = cache.get<{ type: string; features: Array<{ type: string; geometry: unknown; properties: Record<string, unknown> }> }>('berlin:social-atlas:geojson')!;
    const neukoelln = geojson.features.find(
      (f) => f.properties!.plrId === '08010101',
    )!;

    expect(neukoelln.properties!.plrName).toBe('Neukölln-Nord');
    expect(neukoelln.properties!.statusIndex).toBe(4);
    expect(neukoelln.properties!.statusLabel).toBe('sehr niedrig');
    expect(neukoelln.properties!.unemployment).toBe(14.2);
    expect(neukoelln.properties!.welfare).toBe(22.0);
    expect(neukoelln.properties!.childPoverty).toBe(40.0);
    expect(neukoelln.properties!.singleParent).toBe(30.0);
  });

  it('preserves polygon geometry from indicator layer', async () => {
    mockFetchResponses();

    const cache = createCache();
    const ingest = createSocialAtlasIngestion(cache);
    await ingest();

    const geojson = cache.get<{ type: string; features: Array<{ type: string; geometry: unknown; properties: Record<string, unknown> }> }>('berlin:social-atlas:geojson')!;
    const feature = geojson.features[0];
    expect((feature.geometry as { type: string }).type).toBe('MultiPolygon');
  });

  it('filters out features with kom !== "gultig"', async () => {
    mockFetchResponses();

    const cache = createCache();
    const ingest = createSocialAtlasIngestion(cache);
    await ingest();

    const geojson = cache.get<{ type: string; features: Array<{ type: string; geometry: unknown; properties: Record<string, unknown> }> }>('berlin:social-atlas:geojson')!;
    const ids = geojson.features.map((f) => f.properties!.plrId);
    expect(ids).not.toContain('99990101');
  });

  it('handles WFS fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createSocialAtlasIngestion(cache);
    await ingest(); // should not throw

    expect(cache.get('berlin:social-atlas:geojson')).toBeNull();
  });

  it('uses 7-day TTL for cache entries', async () => {
    mockFetchResponses();

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    const ingest = createSocialAtlasIngestion(cache);
    await ingest();

    const geojsonCall = setSpy.mock.calls.find((c) => c[0] === 'berlin:social-atlas:geojson');
    expect(geojsonCall![2]).toBe(604800);
  });

  it('handles empty WFS response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createSocialAtlasIngestion(cache);
    await ingest();

    const geojson = cache.get<{ type: string; features: Array<{ type: string; geometry: unknown; properties: Record<string, unknown> }> }>('berlin:social-atlas:geojson');
    expect(geojson).toBeTruthy();
    expect(geojson!.features).toHaveLength(0);
  });
});
