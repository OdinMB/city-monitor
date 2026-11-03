import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BikeSharingData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { BIKE_SHARING_DB_INTERVAL_MS, createBikeSharingIngestion } from './ingest-bike-sharing.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveBikeSharing: (...args: unknown[]) => mockSave(...args),
}));

const fixture = (name: string) => readFileSync(new URL(`../lib/bike-sharing-fixtures/${name}.json`, import.meta.url), 'utf8');
const KVB_GBFS = fixture('kvb-rad-gbfs');
const KVB_INFO = fixture('kvb-rad-station-information');
const KVB_STATUS = fixture('kvb-rad-station-status');
const STADTRAD = fixture('stadtrad-things');

/** Answers each URL with the fixture its path names; `overrides` replaces one by a URL fragment. */
function respond(overrides: Record<string, () => Response> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    for (const [part, make] of Object.entries(overrides)) if (url.includes(part)) return make();
    if (url.endsWith('nextbike_kg/gbfs.json')) return new Response(KVB_GBFS);
    if (url.endsWith('station_information.json')) return new Response(KVB_INFO);
    if (url.endsWith('station_status.json')) return new Response(KVB_STATUS);
    if (url.startsWith('https://iot.hamburg.de/v1.1/Things?')) return new Response(STADTRAD);
    return new Response('not found', { status: 404 });
  });
}

describe('createBikeSharingIngestion', () => {
  beforeEach(() => {
    mockSave.mockClear();
    // The StadtRAD fixture's counts are from 2026-11-03; newer than a month by then
    vi.useFakeTimers({ now: new Date('2026-11-03T01:15:00Z'), toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('follows KVB-Rad\'s GBFS discovery and stores Köln\'s stations with system and operator', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const fetchSpy = respond();
    const cache = createCache();
    const db = {} as Db;
    await createBikeSharingIngestion(cache, db)();

    expect(fetchSpy.mock.calls.map(([u]) => String(u))).toEqual([
      'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_kg/gbfs.json',
      'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_kg/de/station_information.json',
      'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_kg/de/station_status.json',
    ]);
    const data = cache.get<BikeSharingData>('koeln:bike-sharing')!;
    expect(data.system).toBe('KVB-Rad');
    expect(data.operator).toBe('nextbike');
    expect(data.stations).toHaveLength(6);
    expect(mockSave).toHaveBeenCalledWith(db, 'koeln', data);
  });

  it('reads Hamburg\'s StadtRAD from the SensorThings API', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    respond();
    const cache = createCache();
    await createBikeSharingIngestion(cache)();

    const data = cache.get<BikeSharingData>('hamburg:bike-sharing')!;
    expect(data.system).toBe('StadtRAD Hamburg');
    expect(data.stations.map((s) => s.name)).toEqual([
      'S+U Berliner Tor / Beim Strohhause', 'Alsterschwimmhalle / Ifflandstraße', 'Bogenstraße / Grindelallee',
    ]);
    expect(data.updated).toBe('2026-11-03T00:22:03.002Z');
  });

  it('writes to Postgres at most every 30 minutes per city, but refreshes the cache every run', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    respond();
    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    let t = 1_000_000;
    const ingest = createBikeSharingIngestion(cache, {} as Db, () => t);
    await ingest();
    t += 5 * 60_000;
    await ingest();
    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenCalledTimes(1);
    t += BIKE_SHARING_DB_INTERVAL_MS;
    await ingest();
    expect(mockSave).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous stations when a feed fails or lists none in the city', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    respond({ station_status: () => new Response('', { status: 502 }) });
    await createBikeSharingIngestion(cache, {} as Db)();
    vi.restoreAllMocks();

    const setSpy2 = vi.spyOn(cache, 'set');
    respond({ station_information: () => new Response(JSON.stringify({ data: { stations: [] } })) });
    await createBikeSharingIngestion(cache, {} as Db)();

    expect(setSpy).not.toHaveBeenCalled();
    expect(setSpy2).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('makes no request for a city without the source', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const { koeln } = await import('../config/cities/koeln.js');
    const saved = koeln.dataSources.bikeSharing;
    delete koeln.dataSources.bikeSharing;
    try {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await createBikeSharingIngestion(createCache())();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      koeln.dataSources.bikeSharing = saved;
    }
  });
});
