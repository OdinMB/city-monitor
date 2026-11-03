import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeatReliefData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { createHeatReliefIngestion } from './ingest-heat-relief.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveHeatRelief: (...args: unknown[]) => mockSave(...args),
}));

const fixture = (name: string) => readFileSync(new URL(`../lib/heat-relief-fixtures/${name}`, import.meta.url), 'utf8');

/** Answers each service with its fixture; `overrides` replaces one by a URL fragment. */
function respond(overrides: Record<string, () => Response> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    for (const [part, make] of Object.entries(overrides)) if (url.includes(part)) return make();
    if (url.includes('/wfs/kuehle_raeume?')) return new Response(fixture('berlin-cool-rooms.json'));
    if (url.includes('/wfs/trinkwasserbrunnen?')) return new Response(fixture('berlin-fountains.json'));
    if (url.includes('/wfs/toiletten?')) return new Response(fixture('berlin-toilets.json'));
    if (url.includes('kuehle_orte_wfs')) return new Response(fixture('koeln-cool-im_innenraum.json'));
    if (url.includes('trinkwasserbrunnen_wfs')) return new Response(fixture('koeln-fountains.json'));
    if (url.startsWith('https://www.awbkoeln.de/geodaten/toiletten/')) return new Response(fixture('koeln-toilets.xml'));
    return new Response('not found', { status: 404 });
  });
}

const kinds = (data: HeatReliefData) => data.places.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), {});

describe('createHeatReliefIngestion', () => {
  beforeEach(() => mockSave.mockClear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads Berlin's three lists into one set of places and stores it", async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const fetchSpy = respond();
    const cache = createCache();
    const db = {} as Db;
    await createHeatReliefIngestion(cache, db)();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const data = cache.get<HeatReliefData>('berlin:heat-relief')!;
    expect(kinds(data)).toEqual({ cool: 2, fountain: 2, toilet: 2 });
    expect(mockSave).toHaveBeenCalledWith(db, 'berlin', data);
  });

  it("asks Köln for each cool-places layer and converts its fountains", async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const fetchSpy = respond();
    const cache = createCache();
    await createHeatReliefIngestion(cache)();

    // Three cool-places layers, the fountains, the toilets
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    const data = cache.get<HeatReliefData>('koeln:heat-relief')!;
    expect(kinds(data)).toEqual({ cool: 6, fountain: 2, toilet: 3 });
    expect(new Set(data.places.filter((p) => p.kind === 'cool').map((p) => p.setting))).toEqual(new Set(['indoor', 'air-conditioned', 'water']));
  });

  it('keeps the previous places of a kind whose list fails, and the rest fresh', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const cache = createCache();
    const old = { kind: 'toilet' as const, lat: 52.5, lon: 13.4, name: 'Alte Toilette' };
    cache.set('berlin:heat-relief', { places: [old, { kind: 'cool', lat: 52.5, lon: 13.4, name: 'Alter Raum' }] }, 60);
    respond({ '/wfs/toiletten?': () => new Response('<ows:ExceptionReport/>', { status: 200 }) });
    await createHeatReliefIngestion(cache)();

    const data = cache.get<HeatReliefData>('berlin:heat-relief')!;
    expect(data.places.filter((p) => p.kind === 'toilet')).toEqual([old]);
    expect(data.places.filter((p) => p.kind === 'cool').map((p) => p.name)).toEqual(['Lindenkirche', 'Stadtteilzentrum Hellersdorfer Terrassen']);
  });

  it('leaves the cache alone when every list fails, and skips cities without lists', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const cache = createCache();
    const before: HeatReliefData = { places: [{ kind: 'fountain', lat: 52.5, lon: 13.4, name: 'Brunnen' }] };
    cache.set('berlin:heat-relief', before, 60);
    respond({ 'gdi.berlin.de': () => new Response('down', { status: 503 }) });
    await createHeatReliefIngestion(cache, {} as Db)();

    expect(cache.get('berlin:heat-relief')).toEqual(before);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('drops places outside the city', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const far = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [11.5, 48.1] }, properties: { standort: 'München?' } }] });
    respond({ '/wfs/trinkwasserbrunnen?': () => new Response(far) });
    const cache = createCache();
    await createHeatReliefIngestion(cache)();
    expect(kinds(cache.get<HeatReliefData>('berlin:heat-relief')!)).toEqual({ cool: 2, toilet: 2 });
  });
});
