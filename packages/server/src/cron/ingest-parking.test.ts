import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParkingData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import {
  createParkingIngestion, hamburgParkingUrl, parkingTrend, parseHamburgParking, parseReceived, PARKING_DB_INTERVAL_MS,
} from './ingest-parking.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveParking: (...args: unknown[]) => mockSave(...args),
}));

// Recorded from geodienste.hamburg.de/wfs_parkhaeuser on 2026-11-03 at 03:0x,
// trimmed to six car parks and their occupancy fields (dl-de/by-2.0): one
// without live data, one closed with no spaces, one reporting a fault.
const RAW = readFileSync(new URL('./fixtures/hh-parkhaeuser.json', import.meta.url), 'utf8');
const FIXTURE = JSON.parse(RAW) as { features: Array<{ properties: Record<string, unknown> }> };

describe('parseReceived', () => {
  it('reads the German local time with its offset, winter and summer', () => {
    expect(parseReceived('03.11.2026, 03:03')).toBe('2026-11-03T03:03:00+01:00');
    expect(parseReceived('15.07.2026, 18:40')).toBe('2026-07-15T18:40:00+02:00');
  });

  it('returns null for anything else', () => {
    expect(parseReceived(null)).toBeNull();
    expect(parseReceived('gestern')).toBeNull();
  });
});

describe('parseHamburgParking', () => {
  const data = parseHamburgParking(FIXTURE)!;

  it('keeps only the car parks with live counts, by name', () => {
    expect(data.facilities.map((f) => f.name)).toEqual([
      'Alsterhaus', 'Am Hauptbahnhof', 'Deichtorhallen', 'Europa-Passage', 'Parkhaus Stadthöfe (Bleichenhof)',
    ]);
    expect(data.updated).toBe('2026-11-03T03:03:00+01:00');
  });

  it('maps a car park with its id, kind, counts, status and report time', () => {
    expect(data.facilities[1]).toEqual({
      id: '10002', name: 'Am Hauptbahnhof', kind: 'garage', lat: 53.55472284386281, lon: 10.009583220644242,
      free: 246, total: 547, status: 'open', trend: null, updated: '2026-11-03T03:03:00+01:00',
    });
    expect(data.facilities.find((f) => f.name === 'Deichtorhallen')!.kind).toBe('lot');
  });

  it('reads the guidance system\'s status, and a car park with no spaces as closed', () => {
    const status = Object.fromEntries(data.facilities.map((f) => [f.name, f.status]));
    expect(status['Europa-Passage']).toBe('fault');
    expect(status['Parkhaus Stadthöfe (Bleichenhof)']).toBe('closed');
    expect(status.Alsterhaus).toBe('open');
  });

  it('keeps free within 0 and the total, and reads kinds in any case', () => {
    const odd = { features: [{ ...FIXTURE.features[2], properties: { ...FIXTURE.features[2]!.properties, frei: 600, art: 'tiefgarage' } }] };
    expect(parseHamburgParking(odd)!.facilities[0]).toMatchObject({ free: 547, kind: 'underground' });
  });

  it('returns null for an answer that is not a feature collection', () => {
    expect(parseHamburgParking({ error: 'x' })).toBeNull();
    expect(parseHamburgParking(null)).toBeNull();
  });
});

describe('parkingTrend', () => {
  const now = 1_000_000_000_000;
  const at = (minutesAgo: number, free: number) => ({ at: now - minutesAgo * 60_000, free });

  it('compares with the oldest reading 10 to 30 minutes old', () => {
    expect(parkingTrend(200, 547, [at(25, 260), at(15, 240), at(5, 210)], now)).toBe('filling');
    expect(parkingTrend(300, 547, [at(12, 250)], now)).toBe('emptying');
  });

  it('calls a small change steady: under 3 spaces or 2 % of the car park', () => {
    expect(parkingTrend(250, 547, [at(15, 240)], now)).toBe('steady'); // 10 < 11 (2 % of 547)
    expect(parkingTrend(10, 37, [at(15, 12)], now)).toBe('steady'); // 2 < 3
    expect(parkingTrend(9, 37, [at(15, 12)], now)).toBe('filling');
  });

  it('has no trend without a reading in the window', () => {
    expect(parkingTrend(200, 547, [], now)).toBeNull();
    expect(parkingTrend(200, 547, [at(5, 300)], now)).toBeNull();
    expect(parkingTrend(200, 547, [at(45, 300)], now)).toBeNull();
  });
});

describe('createParkingIngestion', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    fetchMock.mockReset();
    mockSave.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const withFree = (name: string, free: number) => {
    const copy = JSON.parse(RAW) as typeof FIXTURE;
    copy.features.find((f) => f.properties.name === name)!.properties.frei = free;
    return copy;
  };

  it('asks the WFS for GeoJSON in WGS 84, for Hamburg only', async () => {
    fetchMock.mockResolvedValue(new Response(RAW));
    const cache = createCache();
    await createParkingIngestion(cache, null)();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe('https://geodienste.hamburg.de/wfs_parkhaeuser');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      SERVICE: 'WFS', REQUEST: 'GetFeature', typeNames: 'de.hh.up:parkhaeuser', outputFormat: 'application/geo+json', srsName: 'EPSG:4326',
    });
    expect(hamburgParkingUrl('https://x.test/wfs')).toContain('https://x.test/wfs?SERVICE=WFS');
    expect(cache.get<ParkingData>('hamburg:parking')!.facilities).toHaveLength(5);
    expect(cache.get('berlin:parking')).toBeNull();
  });

  it('adds a trend from the readings it saw 10 to 30 minutes before, for open car parks only', async () => {
    let t = 0;
    const cache = createCache();
    const ingest = createParkingIngestion(cache, null, () => t);
    const trend = (name: string) => cache.get<ParkingData>('hamburg:parking')!.facilities.find((f) => f.name === name)!.trend;

    fetchMock.mockResolvedValueOnce(new Response(RAW));
    await ingest();
    expect(trend('Am Hauptbahnhof')).toBeNull();

    t = 10 * 60_000;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(withFree('Am Hauptbahnhof', 200))));
    await ingest();
    expect(trend('Am Hauptbahnhof')).toBe('filling');
    expect(trend('Alsterhaus')).toBe('steady');
    expect(trend('Europa-Passage')).toBeNull();
  });

  it('stores at most one row per interval, and keeps the last list when the WFS fails or reports nothing', async () => {
    let t = 0;
    const cache = createCache();
    const ingest = createParkingIngestion(cache, {} as Db, () => t);
    fetchMock.mockImplementation(async () => new Response(RAW));
    await ingest();
    t = 5 * 60_000;
    await ingest();
    expect(mockSave).toHaveBeenCalledTimes(1);
    t = PARKING_DB_INTERVAL_MS;
    await ingest();
    expect(mockSave).toHaveBeenCalledTimes(2);

    fetchMock.mockImplementation(async () => new Response('', { status: 502 }));
    await ingest();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [FIXTURE.features[0]] })));
    await ingest();
    expect(cache.get<ParkingData>('hamburg:parking')!.facilities).toHaveLength(5);
  });
});
