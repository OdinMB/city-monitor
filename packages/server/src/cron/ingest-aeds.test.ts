import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const noWait = async () => {};

describe('ingest-aeds', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('when Overpass is busy', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('retries a 429 after a pause and keeps the answer that follows', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockOverpassResponse), { status: 200 }));
      const waits: number[] = [];

      const cache = createCache();
      await createAedIngestion(cache, null, async (ms) => { waits.push(ms); })();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(waits).toEqual([15_000]);
      expect(cache.get<AedLocation[]>('berlin:aed:locations')).toHaveLength(3);
    });

    it('gives up after two retries and leaves the cache as it was', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 504 }));

      const cache = createCache();
      await createAedIngestion(cache, null, noWait)();

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(cache.get<AedLocation[]>('berlin:aed:locations')).toBeNull();
    });

    it('pauses between cities, so the later ones are not turned away', async () => {
      vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg,koeln');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        new Response(JSON.stringify(mockOverpassResponse), { status: 200 }),
      );
      const waits: number[] = [];

      await createAedIngestion(createCache(), null, async (ms) => { waits.push(ms); })();

      expect(waits).toEqual([5_000, 5_000]);
    });

    it('stores nothing from an answer carrying any remark, whose elements are incomplete', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ elements: [], remark: 'runtime error: open64: 0 Success /osm3s_v0.7.62_osm_base Dispatcher_Client::request_read_and_idx::rate_limited' }), { status: 200 }),
      );

      const cache = createCache();
      await createAedIngestion(cache, null, noWait)();

      expect(cache.get<AedLocation[]>('berlin:aed:locations')).toBeNull();
    });
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

  describe('the area it asks Overpass for', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /** The boundary filters of each Overpass query the ingestion sent, by city name. */
    async function areasAskedFor(activeCities: string): Promise<string[]> {
      vi.stubEnv('ACTIVE_CITIES', activeCities);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        new Response(JSON.stringify({ elements: [] }), { status: 200 }),
      );
      await createAedIngestion(createCache(), null, noWait)();
      return fetchSpy.mock.calls.map(([, init]) => {
        const query = new URLSearchParams(String(init?.body)).get('data') ?? '';
        return /area(\[[^;]*?\])->/.exec(query)?.[1] ?? query;
      });
    }

    it('looks for a state-level area named like a city-state, which names no admin level', async () => {
      expect(await areasAskedFor('berlin,hamburg')).toEqual([
        '["name"="Berlin"]["admin_level"="4"]["boundary"="administrative"]',
        '["name"="Hamburg"]["admin_level"="4"]["boundary"="administrative"]',
      ]);
    });

    it('looks for the area at the admin level a city inside a state names', async () => {
      expect(await areasAskedFor('koeln')).toEqual([
        '["name"="Köln"]["admin_level"="6"]["boundary"="administrative"]',
      ]);
    });
  });
});
