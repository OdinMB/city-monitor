import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiftOutageData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import {
  buildLiftOutages, createLiftOutageIngestion, decodeKvbBody, parseKvbList, splitKvbName,
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

  it('makes no request without a city that has the source', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await createLiftOutageIngestion(createCache())();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
