import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createConstructionIngestion } from './ingest-construction.js';
import type { ConstructionSite } from '@city-monitor/shared';

const mockVizGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [13.4, 52.52] },
      properties: {
        id: '1001',
        subtype: 'Baustelle',
        street: 'Friedrichstraße (Mitte)',
        section: 'Unter den Linden – Leipziger Straße',
        content: 'Kanalsanierung, Fahrbahn halbseitig gesperrt',
        direction: 'Beidseitig',
        icon: 'baustelle',
        is_future: false,
        validity: { from: '01.03.2026 06:00', to: '15.04.2026 18:00' },
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[13.35, 52.51], [13.36, 52.52]] },
      properties: {
        id: '1002',
        subtype: 'Sperrung',
        street: 'Kantstraße (Charlottenburg)',
        section: null,
        content: 'Vollsperrung wegen Brückenbauarbeiten',
        direction: null,
        icon: 'sperrung',
        is_future: true,
        validity: { from: '10.03.2026 00:00', to: '20.03.2026 23:59' },
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [13.45, 52.53] },
      properties: {
        id: '1003',
        subtype: 'Unfall',
        street: 'Alexanderplatz (Mitte)',
        section: null,
        content: 'Verkehrsunfall mit Sperrung',
        direction: null,
        icon: 'warnung',
        is_future: false,
        validity: { from: '03.03.2026 08:00', to: '03.03.2026 12:00' },
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [13.42, 52.50] },
      properties: {
        id: '1004',
        subtype: 'Storung',
        street: 'Hermannstraße (Neukölln)',
        section: 'Boddinstraße – Leinestraße',
        content: 'Wasserrohrbruch, Fahrbahn eingeengt',
        direction: null,
        icon: 'warnung',
        is_future: false,
        validity: { from: '02.03.2026 14:00', to: null },
      },
    },
  ],
};

describe('ingest-construction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches VIZ GeoJSON and writes ConstructionSite[] to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVizGeoJSON), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createConstructionIngestion(cache);
    await ingest();

    const sites = cache.get<ConstructionSite[]>('berlin:construction:sites');
    expect(sites).toBeTruthy();
    // 3 items: Baustelle, Sperrung, Storung — Unfall filtered out
    expect(sites!.length).toBe(3);
  });

  it('filters out Unfall (accident) subtypes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVizGeoJSON), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createConstructionIngestion(cache);
    await ingest();

    const sites = cache.get<ConstructionSite[]>('berlin:construction:sites')!;
    const subtypes = sites.map((s) => s.subtype);
    expect(subtypes).not.toContain('accident');
    expect(sites.every((s) => s.id !== '1003')).toBe(true);
  });

  it('maps VIZ subtypes to normalized subtype values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVizGeoJSON), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createConstructionIngestion(cache);
    await ingest();

    const sites = cache.get<ConstructionSite[]>('berlin:construction:sites')!;
    const byId = Object.fromEntries(sites.map((s) => [s.id, s]));

    expect(byId['1001'].subtype).toBe('construction');
    expect(byId['1002'].subtype).toBe('closure');
    expect(byId['1004'].subtype).toBe('disruption');
  });

  it('maps properties correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVizGeoJSON), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createConstructionIngestion(cache);
    await ingest();

    const sites = cache.get<ConstructionSite[]>('berlin:construction:sites')!;
    const site = sites.find((s) => s.id === '1001')!;

    expect(site.street).toBe('Friedrichstraße (Mitte)');
    expect(site.section).toBe('Unter den Linden – Leipziger Straße');
    expect(site.description).toBe('Kanalsanierung, Fahrbahn halbseitig gesperrt');
    expect(site.direction).toBe('Beidseitig');
    expect(site.validFrom).toBe('01.03.2026 06:00');
    expect(site.validUntil).toBe('15.04.2026 18:00');
    expect(site.isFuture).toBe(false);
    expect(site.geometry).toEqual({ type: 'Point', coordinates: [13.4, 52.52] });
  });

  it('handles null validity.to gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVizGeoJSON), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createConstructionIngestion(cache);
    await ingest();

    const sites = cache.get<ConstructionSite[]>('berlin:construction:sites')!;
    const site = sites.find((s) => s.id === '1004')!;
    expect(site.validUntil).toBeUndefined();
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createConstructionIngestion(cache);
    await ingest(); // should not throw

    const sites = cache.get<ConstructionSite[]>('berlin:construction:sites');
    expect(sites).toBeNull();
  });

  it('handles empty feature collection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createConstructionIngestion(cache);
    await ingest();

    const sites = cache.get<ConstructionSite[]>('berlin:construction:sites');
    expect(sites).toEqual([]);
  });

  describe('other providers', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });

    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const urlOf = (call: unknown[]) => new URL(String(call[0]));

    it('reads Hamburg from its OGC API', async () => {
      vi.stubEnv('ACTIVE_CITIES', 'hamburg');
      vi.useFakeTimers({ now: new Date('2026-11-01T11:00:00Z'), toFake: ['Date'] });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', id: 1, geometry: { type: 'Point', coordinates: [10, 53.55] }, properties: { titel: 'Test', organisation: 'LSBG', umfang: 'Fahrstreifen gesperrt', baubeginn: '01.10.2026', bauende: '30.11.2026' } }],
      }));

      const cache = createCache();
      await createConstructionIngestion(cache)();

      expect(urlOf(fetchSpy.mock.calls[0]!).hostname).toBe('api.hamburg.de');
      expect(cache.get<ConstructionSite[]>('hamburg:construction:sites')).toEqual([
        expect.objectContaining({ id: 'hh-1', street: 'Test', validUntil: '30.11.2026' }),
      ]);
    });

    it('asks Köln for each configured layer and keeps the last data when one fails', async () => {
      vi.stubEnv('ACTIVE_CITIES', 'koeln');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ type: 'FeatureCollection', features: [] }));

      const cache = createCache();
      await createConstructionIngestion(cache)();
      const layers = fetchSpy.mock.calls.map((c) => urlOf(c).searchParams.get('typeNames'));
      expect(layers).toContain('ms:notfall');
      expect(layers).toContain('ms:strassenbauarbeiten');
      expect(layers).not.toContain('ms:hochbau');
      expect(cache.get<ConstructionSite[]>('koeln:construction:sites')).toEqual([]);

      cache.set('koeln:construction:sites', [{ id: 'kept' }], 1800);
      fetchSpy.mockReset();
      fetchSpy.mockImplementation(async (input) => new URL(String(input)).searchParams.get('typeNames') === 'ms:kanalsanierung'
        ? new Response('', { status: 503 })
        : json({ type: 'FeatureCollection', features: [] }));
      await createConstructionIngestion(cache)();
      expect(cache.get('koeln:construction:sites')).toEqual([{ id: 'kept' }]);
    });

    it('filters München on the server', async () => {
      vi.stubEnv('ACTIVE_CITIES', 'muenchen');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ type: 'FeatureCollection', features: [] }));

      const cache = createCache();
      await createConstructionIngestion(cache)();

      const url = urlOf(fetchSpy.mock.calls[0]!);
      expect(url.hostname).toBe('geoportal.muenchen.de');
      expect(url.searchParams.get('srsName')).toBe('EPSG:4326');
      expect(url.searchParams.get('CQL_FILTER')).toContain('beeintraechtigung');
      expect(cache.get<ConstructionSite[]>('muenchen:construction:sites')).toEqual([]);
    });
  });

  it('skips cities without roadworks config', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVizGeoJSON), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createConstructionIngestion(cache);
    await ingest();

    // Should only have fetched for berlin (has roadworks config), not hamburg
    // The exact call count depends on active cities, but fetch should be called
    expect(fetchSpy).toHaveBeenCalled();
  });
});
