import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrafficCountData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { createTrafficCountIngestion, SITE_NAMES_MAX_AGE_MS } from './ingest-traffic-counts.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveTrafficCounts: (...args: unknown[]) => mockSave(...args),
}));

const fixture = (name: string) => readFileSync(new URL(`../lib/traffic-count-fixtures/${name}.json`, import.meta.url), 'utf8');
const CAR_LATEST = fixture('car-latest');
const CAR_HOURS = fixture('car-hours');
const CAR_SITES = fixture('car-sites');

const H = '2026-11-02T23:00:00Z';
const BIKE_LATEST = JSON.stringify({ value: [{
  '@iot.id': 900, properties: { assetID: '0002' },
  Thing: { Locations: [{ location: { type: 'Feature', geometry: { type: 'Point', coordinates: [9.85, 53.56] } } }] },
  Observations: [{ phenomenonTime: `${H}/2026-11-02T23:59:59Z`, result: 3 }],
}] });
const BIKE_HOURS = JSON.stringify({ value: [{ '@iot.id': 900, Observations: [
  { phenomenonTime: `${H}/2026-11-02T23:59:59Z`, result: 3 },
  { phenomenonTime: '2026-10-26T23:00:00Z/2026-10-26T23:59:59Z', result: 2 },
  { phenomenonTime: '2026-10-19T22:00:00Z/2026-10-19T22:59:59Z', result: 4 },
] }] });
const BIKE_SITES = JSON.stringify({ type: 'FeatureCollection', features: [{ properties: { zaehlstelle: '0002', bezeichnung: 'Osdorfer Landstraße / Windmühlenweg' } }] });

/** Answers each request by what it asks for; `overrides` replaces one by a part of the decoded URL. */
function respond(overrides: Record<string, () => Response> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = decodeURIComponent(String(input)).replace(/\+/g, ' ');
    for (const [part, make] of Object.entries(overrides)) if (url.includes(part)) return make();
    if (url.includes('typeNames=app:kfz_zaehlstellen')) return new Response(CAR_SITES);
    if (url.includes('typeNames=app:radverkehr_zaehlstellen')) return new Response(BIKE_SITES);
    const latest = url.includes('Thing(');
    if (url.includes('Kfz-Aufkommen')) return new Response(latest ? CAR_LATEST : CAR_HOURS);
    if (url.includes('Fahrrad-Aufkommen')) return new Response(latest ? BIKE_LATEST : BIKE_HOURS);
    return new Response('not found', { status: 404 });
  });
}

describe('createTrafficCountIngestion', () => {
  beforeEach(() => {
    mockSave.mockClear();
    vi.useFakeTimers({ now: new Date('2026-11-03T01:45:00Z'), toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('stores Hamburg\'s car and bicycle sites with their usual counts', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    const fetchSpy = respond();
    const cache = createCache();
    const db = {} as Db;
    await createTrafficCountIngestion(cache, db)();

    // Two site lists, then per mode the newest hours and the hour with its reference weeks
    expect(fetchSpy).toHaveBeenCalledTimes(6);
    const data = cache.get<TrafficCountData>('hamburg:traffic-counts')!;
    expect(data.sites.map((s) => s.id)).toEqual(['car-0113', 'car-0203', 'car-0205', 'bike-0002']);
    expect(data.sites.find((s) => s.id === 'car-0113')).toMatchObject({ count: 64, typical: 137, name: 'Shanghaiallee / Überseeallee' });
    // A car site named only on the bicycle list would take that name; 0203 is on neither
    expect(data.sites.find((s) => s.id === 'car-0203')!.name).toBeNull();
    expect(data.sites.find((s) => s.id === 'bike-0002')).toMatchObject({
      count: 3, typical: 3, name: 'Osdorfer Landstraße / Windmühlenweg', hour: '2026-11-02T23:00:00.000Z',
    });
    expect(mockSave).toHaveBeenCalledWith(db, 'hamburg', data);
  });

  it('stores a row only when a new hour comes in, and reads the site lists once a day', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    const fetchSpy = respond();
    let t = Date.parse('2026-11-03T01:45:00Z');
    const ingest = createTrafficCountIngestion(createCache(), {} as Db, () => t);
    await ingest();
    t += 15 * 60_000;
    await ingest();
    const siteListCalls = () => fetchSpy.mock.calls.filter(([u]) => String(u).includes('HH_WFS_Verkehrszaehlstellen')).length;
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(6 + 4);
    expect(siteListCalls()).toBe(2);

    t += SITE_NAMES_MAX_AGE_MS;
    await ingest();
    expect(siteListCalls()).toBe(4);
  });

  it('keeps a mode\'s last sites when its counters do not answer', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    const cache = createCache();
    const ingest = createTrafficCountIngestion(cache);
    respond();
    await ingest();
    vi.restoreAllMocks();
    respond({ 'Fahrrad-Aufkommen': () => new Response('down', { status: 503 }) });
    await ingest();
    const data = cache.get<TrafficCountData>('hamburg:traffic-counts')!;
    expect(data.sites.filter((s) => s.mode === 'bike').map((s) => s.id)).toEqual(['bike-0002']);
  });

  it('skips cities without traffic counters', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const fetchSpy = respond();
    const cache = createCache();
    await createTrafficCountIngestion(cache)();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.get('berlin:traffic-counts')).toBeNull();
  });
});
