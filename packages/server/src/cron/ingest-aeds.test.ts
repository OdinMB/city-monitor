/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createAedIngestion } from './ingest-aeds.js';
import type { AedLocation } from '@city-monitor/shared';

const mockOverpassResponse = {
  elements: [
    {
      type: 'node',
      id: 11111111,
      lat: 52.5200,
      lon: 13.4050,
      tags: {
        emergency: 'defibrillator',
        indoor: 'yes',
        'defibrillator:location': 'In the lobby near reception',
        operator: 'Berlin DRK',
        opening_hours: 'Mo-Fr 08:00-18:00',
        access: 'yes',
      },
    },
    {
      type: 'node',
      id: 22222222,
      lat: 52.5100,
      lon: 13.3900,
      tags: {
        emergency: 'defibrillator',
        indoor: 'no',
      },
    },
    {
      type: 'node',
      id: 33333333,
      lat: 52.5300,
      lon: 13.4200,
      tags: {
        emergency: 'defibrillator',
        'defibrillator:location': 'Outside main entrance',
        access: 'public',
      },
    },
  ],
};

describe('ingest-aeds', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches Overpass API and writes AedLocation[] to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockOverpassResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createAedIngestion(cache);
    await ingest();

    const aeds = cache.get<AedLocation[]>('berlin:aed:locations');
    expect(aeds).toBeTruthy();
    expect(aeds!.length).toBe(3);
  });

  it('maps OSM node fields to AedLocation correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockOverpassResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createAedIngestion(cache);
    await ingest();

    const aeds = cache.get<AedLocation[]>('berlin:aed:locations')!;
    const full = aeds.find((a) => a.id === 'aed-11111111')!;

    expect(full.lat).toBe(52.52);
    expect(full.lon).toBe(13.405);
    expect(full.indoor).toBe(true);
    expect(full.description).toBe('In the lobby near reception');
    expect(full.operator).toBe('Berlin DRK');
    expect(full.openingHours).toBe('Mo-Fr 08:00-18:00');
    expect(full.access).toBe('yes');
  });

  it('handles nodes with minimal tags', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockOverpassResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createAedIngestion(cache);
    await ingest();

    const aeds = cache.get<AedLocation[]>('berlin:aed:locations')!;
    const minimal = aeds.find((a) => a.id === 'aed-22222222')!;

    expect(minimal.lat).toBe(52.51);
    expect(minimal.lon).toBe(13.39);
    expect(minimal.indoor).toBe(false);
    expect(minimal.description).toBeUndefined();
    expect(minimal.operator).toBeUndefined();
    expect(minimal.openingHours).toBeUndefined();
    expect(minimal.access).toBeUndefined();
  });

  it('defaults indoor to false when tag is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockOverpassResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createAedIngestion(cache);
    await ingest();

    const aeds = cache.get<AedLocation[]>('berlin:aed:locations')!;
    const noIndoorTag = aeds.find((a) => a.id === 'aed-33333333')!;
    expect(noIndoorTag.indoor).toBe(false);
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createAedIngestion(cache);
    await ingest(); // should not throw

    const aeds = cache.get<AedLocation[]>('berlin:aed:locations');
    expect(aeds).toBeNull();
  });

  it('handles empty elements array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ elements: [] }), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createAedIngestion(cache);
    await ingest();

    const aeds = cache.get<AedLocation[]>('berlin:aed:locations');
    expect(aeds).toEqual([]);
  });

  it('does not overwrite cache on Overpass timeout response', async () => {
    const cache = createCache();
    cache.set('berlin:aed:locations', [{ id: 'aed-stale' }], 86400);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ remark: 'runtime error: Query timed out in "query" at line 1' }), { status: 200 }),
    );

    const ingest = createAedIngestion(cache);
    await ingest();

    const aeds = cache.get<unknown[]>('berlin:aed:locations')!;
    expect(aeds).toHaveLength(1);
    expect((aeds[0] as { id: string }).id).toBe('aed-stale');
  });

  it('filters out elements without lat/lon', async () => {
    const withBadNode = {
      elements: [
        ...mockOverpassResponse.elements,
        { type: 'node', id: 99999999, tags: { emergency: 'defibrillator' } },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(withBadNode), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createAedIngestion(cache);
    await ingest();

    const aeds = cache.get<AedLocation[]>('berlin:aed:locations')!;
    expect(aeds.length).toBe(3); // bad node filtered out
  });

  it('uses 24h TTL for cache entry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockOverpassResponse), { status: 200 }),
    );

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    const ingest = createAedIngestion(cache);
    await ingest();

    expect(setSpy).toHaveBeenCalledWith(
      'berlin:aed:locations',
      expect.any(Array),
      86400, // 24 hours
    );
  });
});
