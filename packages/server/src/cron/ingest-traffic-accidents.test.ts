import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrafficAccidentData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { createTrafficAccidentIngestion } from './ingest-traffic-accidents.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveTrafficAccidents: (...args: unknown[]) => mockSave(...args),
}));

const ZIP = readFileSync(new URL('../lib/unfallatlas-fixtures/Unfallorte2025_sample.zip', import.meta.url));
const BASE = 'https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/';
const INDEX = {
  datasets: [
    { name: 'Unfallorte2025', files: [
      { name: 'Unfallorte2025_EPSG25832_CSV.zip', timestamp: '2026-07-07T07:47:16.637175' },
      { name: 'Unfallorte2025_EPSG25832_Shape.zip', timestamp: '2026-07-07T07:47:16.638175' },
    ] },
    { name: 'Unfallorte2024', files: [{ name: 'Unfallorte2024_EPSG25832_CSV.zip' }] },
  ],
};

function respond(overrides: Record<string, () => Response> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    for (const [part, make] of Object.entries(overrides)) if (url.includes(part)) return make();
    if (url === `${BASE}index.json`) return new Response(JSON.stringify(INDEX));
    if (url === `${BASE}Unfallorte2025_EPSG25832_CSV.zip`) return new Response(new Uint8Array(ZIP));
    return new Response('not found', { status: 404 });
  });
}

describe('createTrafficAccidentIngestion', () => {
  beforeEach(() => mockSave.mockClear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('downloads the newest year once and stores each city\'s accidents', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,koeln,muenchen');
    const fetchSpy = respond();
    const cache = createCache();
    const db = {} as Db;
    await createTrafficAccidentIngestion(cache, db)();

    expect(fetchSpy.mock.calls.map(([u]) => String(u))).toEqual([`${BASE}index.json`, `${BASE}Unfallorte2025_EPSG25832_CSV.zip`]);
    const koeln = cache.get<TrafficAccidentData>('koeln:traffic-accidents')!;
    expect(koeln.year).toBe(2025);
    expect(koeln.published).toBe('2026-07-07T07:47:16');
    expect(koeln.accidents.map((a) => a[2])).toEqual([3, 1]);
    expect(cache.get<TrafficAccidentData>('berlin:traffic-accidents')!.accidents).toHaveLength(1);
    expect(cache.get<TrafficAccidentData>('muenchen:traffic-accidents')!.accidents).toHaveLength(1);
    expect(mockSave).toHaveBeenCalledTimes(3);
    expect(mockSave).toHaveBeenCalledWith(db, 'koeln', koeln);
  });

  it('keeps the previous data for a city the file has no valid rows for', async () => {
    // The fixture's one Hamburg row has month 13
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    respond();
    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    await createTrafficAccidentIngestion(cache, {} as Db)();
    expect(setSpy).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('stores nothing when the archive fails or is not a ZIP', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    respond({ '_CSV.zip': () => new Response('', { status: 503 }) });
    await createTrafficAccidentIngestion(cache, {} as Db)();
    vi.restoreAllMocks();

    const setSpy2 = vi.spyOn(cache, 'set');
    respond({ '_CSV.zip': () => new Response('<html>moved</html>') });
    await createTrafficAccidentIngestion(cache, {} as Db)();

    expect(setSpy).not.toHaveBeenCalled();
    expect(setSpy2).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('makes no request when no active city has the source', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const { koeln } = await import('../config/cities/koeln.js');
    const saved = koeln.dataSources.trafficAccidents;
    delete koeln.dataSources.trafficAccidents;
    try {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await createTrafficAccidentIngestion(createCache())();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      koeln.dataSources.trafficAccidents = saved;
    }
  });
});
