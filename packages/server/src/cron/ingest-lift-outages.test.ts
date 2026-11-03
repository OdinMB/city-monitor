import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityConfig, LiftOutageData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import {
  buildLiftOutages, createLiftOutageIngestion, dbFastaCredentials, decodeKvbBody, fastaFacilitiesUrl, ingestsLiftOutages,
  parseFastaFacilities, parseKvbList, splitKvbName,
} from './ingest-lift-outages.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveLiftOutages: (...args: unknown[]) => mockSave(...args),
}));

// Recorded from KVB's open-data service on 2026-11-02 at 04:1x, trimmed (lifts:
// 4 of 5; escalators: 6 of 44, with one repeated as KVB repeats it). KVB sends
// the escalator list in ISO-8859-1; the fixture is stored as UTF-8 and encoded
// back to Latin-1 where the bytes matter.
const text = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const LIFTS = text('kvb-aufzugsstoerung.json');
const ESCALATORS = text('kvb-fahrtreppenstoerung.json');
const latin1 = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));

describe('decodeKvbBody', () => {
  it('reads UTF-8 as UTF-8 and the Latin-1 escalator list as Latin-1', () => {
    expect(decodeKvbBody(new TextEncoder().encode(LIFTS).buffer as ArrayBuffer)).toContain('Gürtel');
    const bytes = latin1(ESCALATORS);
    expect(decodeKvbBody(bytes.buffer as ArrayBuffer)).toContain('HÜ 081 (Heumarkt/alt)');
  });
});

describe('splitKvbName', () => {
  it.each([
    ['Aufzug 04 - HÜ 011 (Dom/HBf.)', 'Aufzug 04', 'Dom/HBf.'],
    ['Fahrtreppe 52 - Hü 100 (Bensberg)', 'Fahrtreppe 52', 'Bensberg'],
    ['Aufzug 01 - HÜ 072 (Amsterdamer Str./Gürtel)', 'Aufzug 01', 'Amsterdamer Str./Gürtel'],
    ['Aufzug am Neumarkt', '', 'Aufzug am Neumarkt'],
  ])('%s', (name, unit, station) => {
    expect(splitKvbName(name)).toEqual({ unit, station });
  });
});

describe('parseKvbList and buildLiftOutages', () => {
  const lifts = parseKvbList(JSON.parse(LIFTS), 'lift')!;
  const escalators = parseKvbList(JSON.parse(ESCALATORS), 'escalator')!;

  it('reads each unit with its station, place and the list time with the German offset', () => {
    expect(lifts.outages[0]).toEqual({
      id: '072-01', kind: 'lift', station: 'Amsterdamer Str./Gürtel', unit: 'Aufzug 01',
      lat: 50.9709148222635, lon: 6.96910237904765, info: null,
    });
    expect(lifts.updated).toBe('2026-11-02T04:10:32+01:00');
    expect(escalators.updated).toBe('2026-11-02T04:12:28+01:00');
  });

  it('lists each unit once, lifts first, by station', () => {
    const data = buildLiftOutages([lifts, escalators]);
    expect(data.outages.map((o) => `${o.kind}:${o.id}`)).toEqual([
      'lift:072-01', 'lift:100-01', 'lift:011-04', 'lift:033-01',
      'escalator:100-52', 'escalator:083-60', 'escalator:011-51', 'escalator:142-61', 'escalator:081-51',
    ]);
    expect(data.updated).toBe('2026-11-02T04:12:28+01:00');
  });

  it('returns null for a body that is not GeoJSON, and skips features without id or name', () => {
    expect(parseKvbList({ error: 'x' }, 'lift')).toBeNull();
    expect(parseKvbList({ features: [{ properties: { Kennung: '', Bezeichnung: 'x' } }] }, 'lift')).toEqual({ outages: [], updated: null });
  });
});

describe('createLiftOutageIngestion', () => {
  beforeEach(() => {
    mockSave.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const respond = (lifts: Response, escalators: Response) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('fahrtreppenstoerung') ? escalators : lifts);

  it('asks for both KVB lists and stores Köln\'s outages', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,koeln');
    const fetchSpy = respond(new Response(LIFTS, { status: 200 }), new Response(latin1(ESCALATORS), { status: 200 }));
    const cache = createCache();
    const db = {} as Db;
    await createLiftOutageIngestion(cache, db)();

    expect(fetchSpy.mock.calls.map(([u]) => String(u)).sort()).toEqual([
      'https://data.webservice-kvb.koeln/service/opendata/aufzugsstoerung/json',
      'https://data.webservice-kvb.koeln/service/opendata/fahrtreppenstoerung/json',
    ]);
    const data = cache.get<LiftOutageData>('koeln:lift-outages')!;
    expect(data.outages).toHaveLength(9);
    expect(data.outages.find((o) => o.id === '081-51')!.station).toBe('Heumarkt/alt');
    expect(mockSave).toHaveBeenCalledWith(db, 'koeln', data);
    expect(cache.get('berlin:lift-outages')).toBeNull();
  });

  it('keeps the previous list when either list fails: a missing list is not "all working"', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    respond(new Response(LIFTS, { status: 200 }), new Response('', { status: 502 }));
    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    await createLiftOutageIngestion(cache, {} as Db)();
    expect(setSpy).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('makes no request without a city that has the source, nor for DB stations without the DB key', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    vi.stubEnv('DB_API_CLIENT_ID', '');
    vi.stubEnv('DB_API_KEY', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await createLiftOutageIngestion(createCache())();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// DB FaSta: built from the published OpenAPI spec (FaSta v2, schema `facility`),
// not from a live answer: the API needs a DB API Marketplace key.
const FASTA_FACILITIES = [
  { equipmentnumber: 10500001, type: 'ELEVATOR', state: 'INACTIVE', description: 'zu Gleis 3/4', stateExplanation: 'not available', stationnumber: 1071, geocoordX: 13.3695, geocoordY: 52.5251, operatorname: 'DB InfraGO', operationalResumeDate: '2026-11-20' },
  { equipmentnumber: 10500002, type: 'ESCALATOR', state: 'INACTIVE', description: 'zum Bahnsteig', stateExplanation: 'under construction', stationnumber: 1071, geocoordX: 13.3697, geocoordY: 52.5252 },
  { equipmentnumber: 10500003, type: 'ELEVATOR', state: 'ACTIVE', description: 'zu Gleis 1/2', stationnumber: 1071 },
  { equipmentnumber: 10500004, type: 'ELEVATOR', state: 'INACTIVE', stationnumber: 4234 },
  { equipmentnumber: 10500005, type: 'TRAVELATOR', state: 'INACTIVE', stationnumber: 4234 },
  { type: 'ELEVATOR', state: 'INACTIVE', stationnumber: 4234 },
];

describe('DB FaSta', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('reads the credentials only when both are set', () => {
    expect(dbFastaCredentials({})).toBeNull();
    expect(dbFastaCredentials({ DB_API_CLIENT_ID: 'c', DB_API_KEY: ' ' })).toBeNull();
    expect(dbFastaCredentials({ DB_API_CLIENT_ID: 'c', DB_API_KEY: 'k' })).toEqual({ clientId: 'c', apiKey: 'k' });
  });

  it('asks for the inactive lifts and escalators in the bounding box, west, south, east, north', () => {
    expect(fastaFacilitiesUrl({ north: 52.68, south: 52.34, east: 13.76, west: 13.09 })).toBe(
      'https://apis.deutschebahn.com/db-api-marketplace/apis/fasta/v2/facilities?type=ELEVATOR,ESCALATOR&state=INACTIVE&area=13.09,52.34,13.76,52.68',
    );
  });

  it('keeps inactive lifts and escalators, named after their station, with the planned return date', () => {
    const outages = parseFastaFacilities(FASTA_FACILITIES, new Map([[1071, 'Berlin Hbf']]))!;
    expect(outages).toEqual([
      { id: 'db-10500001', kind: 'lift', station: 'Berlin Hbf', unit: 'zu Gleis 3/4', lat: 52.5251, lon: 13.3695, info: null, operator: 'db', resumeDate: '2026-11-20' },
      { id: 'db-10500002', kind: 'escalator', station: 'Berlin Hbf', unit: 'zum Bahnsteig', lat: 52.5252, lon: 13.3697, info: 'under construction', operator: 'db', resumeDate: null },
      { id: 'db-10500004', kind: 'lift', station: 'DB 4234', unit: '', lat: null, lon: null, info: null, operator: 'db', resumeDate: null },
    ]);
    expect(parseFastaFacilities({ errors: [] }, new Map())).toBeNull();
  });

  const fastaFetch = (facilities: Response) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/fasta/v2/facilities')) return facilities.clone();
      if (url.endsWith('/stations/1071')) return new Response(JSON.stringify({ stationnumber: 1071, name: 'Berlin Hbf', facilities: [] }));
      if (url.includes('/stations/')) return new Response('', { status: 404 });
      if (url.includes('fahrtreppenstoerung')) return new Response(latin1(ESCALATORS));
      return new Response(LIFTS);
    });

  it('stores a city\'s DB outages with its key, sending the key in the DB headers', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    vi.stubEnv('DB_API_CLIENT_ID', 'client');
    vi.stubEnv('DB_API_KEY', 'secret');
    const fetchSpy = fastaFetch(new Response(JSON.stringify(FASTA_FACILITIES)));
    const cache = createCache();
    await createLiftOutageIngestion(cache)();

    const [, init] = fetchSpy.mock.calls.find(([u]) => String(u).includes('/facilities'))!;
    expect(init?.headers).toMatchObject({ 'DB-Client-ID': 'client', 'DB-Api-Key': 'secret' });
    const data = cache.get<LiftOutageData>('berlin:lift-outages')!;
    expect(data.updated).toBeNull();
    expect(data.outages.map((o) => o.id)).toEqual(['db-10500001', 'db-10500004', 'db-10500002']);
    expect(data.outages[0]!.station).toBe('Berlin Hbf');
  });

  it('merges DB stations into Köln\'s KVB list, and stores nothing when FaSta fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    vi.stubEnv('DB_API_CLIENT_ID', 'client');
    vi.stubEnv('DB_API_KEY', 'secret');
    fastaFetch(new Response(JSON.stringify(FASTA_FACILITIES)));
    const cache = createCache();
    await createLiftOutageIngestion(cache)();
    const data = cache.get<LiftOutageData>('koeln:lift-outages')!;
    expect(data.outages).toHaveLength(12);
    expect(data.outages.filter((o) => o.operator === 'db')).toHaveLength(3);
    expect(data.updated).toBe('2026-11-02T04:12:28+01:00');

    vi.restoreAllMocks();
    fastaFetch(new Response('', { status: 401 }));
    const fresh = createCache();
    await createLiftOutageIngestion(fresh)();
    expect(fresh.get('koeln:lift-outages')).toBeNull();
  });

  it('runs for a city with DB stations only when the key is set', () => {
    const city = { dataSources: { stationLifts: { provider: 'db-fasta' } } } as unknown as CityConfig;
    expect(ingestsLiftOutages(city, {})).toBe(false);
    expect(ingestsLiftOutages(city, { DB_API_CLIENT_ID: 'c', DB_API_KEY: 'k' })).toBe(true);
  });
});
