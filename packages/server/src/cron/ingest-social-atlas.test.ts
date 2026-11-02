import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SocialAtlasFeatureProps } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import { createSocialAtlasIngestion, mssLayerNames } from './ingest-social-atlas.js';

// Mock WFS response for index indicators layer (mss2025_indexind_542)
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
        ew: 120, kom: 'ungültig (EW unter 300)', zeit: 202412,
        s1: null, s2: null, s3: null, s4: null,
      },
    },
  ],
};

// Mock WFS response for composite indices layer (mss2025_indizes_542)
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

describe('mssLayerNames', () => {
  it('derives both layer names from the edition in the WFS URL', () => {
    expect(mssLayerNames('https://gdi.berlin.de/services/wfs/mss_2025')).toEqual({
      year: '2025',
      indicators: 'mss_2025:mss2025_indexind_542',
      indices: 'mss_2025:mss2025_indizes_542',
    });
    expect(mssLayerNames('https://gdi.berlin.de/services/wfs/mss_2027/').indicators).toBe('mss_2027:mss2027_indexind_542');
  });

  it('rejects a URL that names no edition', () => {
    expect(() => mssLayerNames('https://gdi.berlin.de/services/wfs/mss')).toThrow(/mss_<year>/);
  });
});

describe('ingest-social-atlas', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requests the layers of the configured edition', async () => {
    mockFetchResponses();

    const cache = createCache();
    await createSocialAtlasIngestion(cache)();

    const urls = vi.mocked(globalThis.fetch).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('https://gdi.berlin.de/services/wfs/mss_2025?') && u.includes('typeNames=mss_2025:mss2025_indexind_542'))).toBe(true);
    expect(urls.some((u) => u.includes('typeNames=mss_2025:mss2025_indizes_542'))).toBe(true);
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

  // An empty answer replaced the cached areas once; the population layer, which
  // takes Berlin's polygons from this entry, then lost its map too.
  it('keeps what it had when the WFS answers with no areas', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }),
    );

    const cache = createCache();
    cache.set('berlin:social-atlas:geojson', { type: 'FeatureCollection', features: [{ id: 'old' }] }, 604800);
    await createSocialAtlasIngestion(cache)();

    expect(cache.get<{ features: unknown[] }>('berlin:social-atlas:geojson')!.features).toEqual([{ id: 'old' }]);
  });
});

describe('ingest-social-atlas for Köln and Hamburg', () => {
  const fixture = (name: string) => readFileSync(new URL(`../lib/social-atlas-fixtures/${name}`, import.meta.url));
  type Collection = { features: Array<{ geometry: { type: string }; properties: SocialAtlasFeatureProps }> };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('joins Köln\'s Quartiere of the configured year with the shipped outlines and their Stadtbezirk', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(fixture('koeln-datenkatalog.csv'), { status: 200 }));

    const cache = createCache();
    await createSocialAtlasIngestion(cache)();

    const geojson = cache.get<Collection>('koeln:social-atlas:geojson')!;
    expect(geojson.features.map((f) => f.properties.plrId)).toEqual(['101010001', '101020001', '309050002']);
    const kapitol = geojson.features[0]!;
    expect(kapitol.geometry.type).toMatch(/Polygon/);
    expect(kapitol.properties).toMatchObject({ plrName: 'Kapitol-Viertel', bezId: 'Innenstadt', childPoverty: null, statusIndex: null });
    expect(kapitol.properties.unemployment).toBeCloseTo(6.34, 2);
  });

  it('reads Hamburg\'s Sozialmonitoring annex onto the shipped Statistische Gebiete', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(fixture('hh-sozialmonitoring.xlsx'), { status: 200 }));

    const cache = createCache();
    await createSocialAtlasIngestion(cache)();

    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/Sozialmonitoring-Bericht_2025_Ergebnistabellen\.XLSX$/);
    const geojson = cache.get<Collection>('hamburg:social-atlas:geojson')!;
    expect(geojson.features.map((f) => f.properties.plrId)).toEqual(['4001', '102001', '104001']);
    expect(geojson.features[1]!.properties).toMatchObject({ bezId: 'Harburg', statusLabel: 'mittel', childPoverty: 6.8 });
  });
});
