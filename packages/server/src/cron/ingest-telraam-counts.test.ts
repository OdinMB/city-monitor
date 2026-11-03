import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelraamCountsData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { createTelraamCountsIngestion } from './ingest-telraam-counts.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveTelraamCounts: (...args: unknown[]) => mockSave(...args),
}));

const BASE = 'https://berlin-zaehlt.de/csv/';
const HEADER = 'segment_id,date_local,uptime,ped_lft,ped_rgt,ped_total,bike_lft,bike_rgt,bike_total,car_lft,car_rgt,car_total,heavy_lft,heavy_rgt,heavy_total,v85,car_speed0,car_speed10,car_speed20,car_speed30,car_speed40,car_speed50,car_speed60,car_speed70';
const row = (id: number, at: string, ped: number, bike: number, car: number, heavy: number) =>
  [id, at, 0.99, 0, 0, ped, 0, 0, bike, 0, 0, car, 0, 0, heavy, '', 0, 0, 0, 0, 0, 0, 0, 0].join(',');
const gz = (lines: string[]) => new Uint8Array(gzipSync([HEADER, ...lines].join('\n')));

const SEGMENTS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[13.4, 52.5], [13.402, 52.5]]] },
      properties: { segment_id: 9000001786, osm: { name: 'Oranienstraße', address: { suburb: 'Kreuzberg', 'ISO3166-2-lvl4': 'DE-BE' } } } },
    { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[13.7, 52.4], [13.71, 52.4]]] },
      properties: { segment_id: 9000009999, osm: { name: 'Potsdamer Straße', address: { town: 'Schöneiche bei Berlin', 'ISO3166-2-lvl4': 'DE-BB' } } } },
  ],
};

// Yesterday (Monday 2 Nov) and three Mondays before it, split over the October and November files
const OCTOBER = gz([
  row(9000001786, '2026-10-12 08:00', 300, 700, 2000, 400),
  row(9000001786, '2026-10-19 08:00', 320, 800, 2100, 380),
  row(9000001786, '2026-10-26 08:00', 280, 900, 2200, 420),
  row(9000009999, '2026-10-26 08:00', 1, 1, 1, 1),
]);
// Served with Content-Encoding: gzip, as berlin-zaehlt.de does: fetch hands over the CSV unpacked
const NOVEMBER = [
  HEADER,
  row(9000001786, '2026-11-02 08:00', 200, 400, 1500, 300),
  row(9000001786, '2026-11-02 09:00', 100, 300, 800, 100),
  row(9000001786, '2026-11-03 01:00', 0, 0, 2, 0), // today, still being counted
].join('\n');

describe('createTelraamCountsIngestion', () => {
  beforeEach(() => {
    mockSave.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T04:25:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const respond = (files: Record<string, Response | (() => Response)>) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const name = String(input).slice(BASE.length);
      const r = files[name];
      return r ? (typeof r === 'function' ? r() : r) : new Response('', { status: 404 });
    });

  it('stores yesterday\'s counts for Berlin\'s segments with the usual Monday', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    const fetchSpy = respond({
      'bzm_telraam_segments.geojson': new Response(JSON.stringify(SEGMENTS)),
      'bzm_telraam_2026_10.csv.gz': new Response(OCTOBER),
      'bzm_telraam_2026_11.csv.gz': new Response(NOVEMBER),
    });
    const cache = createCache();
    const db = {} as Db;
    await createTelraamCountsIngestion(cache, db)();

    expect(fetchSpy.mock.calls.map(([u]) => String(u))).toEqual([
      `${BASE}bzm_telraam_segments.geojson`, `${BASE}bzm_telraam_2026_10.csv.gz`, `${BASE}bzm_telraam_2026_11.csv.gz`,
    ]);
    const data = cache.get<TelraamCountsData>('berlin:telraam-counts')!;
    expect(data).toEqual({
      date: '2026-11-02',
      segments: [{
        id: 9000001786, lon: 13.401, lat: 52.5, street: 'Oranienstraße', district: 'Kreuzberg',
        cars: 2300, bikes: 700, pedestrians: 300, heavy: 400, hours: 2,
        usual: { cars: 2100, bikes: 800, pedestrians: 300, heavy: 400, days: 3 },
      }],
    });
    expect(mockSave).toHaveBeenCalledWith(db, 'berlin', data);
    expect(cache.get('hamburg:telraam-counts')).toBeNull();
  });

  it('keeps the previous counts when the segment file fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    respond({ 'bzm_telraam_segments.geojson': new Response('', { status: 502 }) });
    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    await createTelraamCountsIngestion(cache, {} as Db)();
    expect(setSpy).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('makes no request without a city that has the source', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg,koeln');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await createTelraamCountsIngestion(createCache())();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
