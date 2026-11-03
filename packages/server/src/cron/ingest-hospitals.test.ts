import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityConfig, HospitalData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { activeHospitalSources, createHospitalIngestion, servedHospitals } from './ingest-hospitals.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveHospitals: (...args: unknown[]) => mockSave(...args),
}));

const WFS = readFileSync(new URL('../lib/hospital-fixtures/hamburg-wfs.json', import.meta.url), 'utf8');

// Made-up sites in the export's structure (its reuse terms are unconfirmed)
const site = (id: string, ort: string, stufe: string, lon: number, lat: number) =>
  `<Standort><StandortKontaktDaten STOID="${id}" Name="Klinik ${id}" Strasse="Weg 1" PLZ="10000" Ort="${ort}" URL="" Laengengrad="${lon}" Breitengrad="${lat}"/>`
  + `<StandortNotfallversorgung Stufe="${stufe}" Schwerverletztenversorgung="0" Kinder="0" Spezialversorgung="0" StrokeUnit="0" ChestPainUnit="0" StufeNichtVereinbart="0"/></Standort>`;
const ATLAS_XML = `<?xml version="1.0" encoding="UTF-8"?><Standorte>${[
  site('1', 'Berlin', '3', 13.4, 52.52),
  site('2', 'Berlin', '1', 13.3, 52.5),
  site('3', 'Hamburg', '2', 10.054194, 53.577924), // where the WFS has Schön Klinik Eilbek
  site('4', 'Potsdam', '2', 13.06, 52.4),
].join('')}</Standorte>`;

/** A ZIP with stored (uncompressed) members, enough for lib/zip.ts. */
function storedZip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...locals, dir, eocd]);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

const ZIP = storedZip({
  '__MACOSX/Bundes-Klinik-Atlas_Datenexport_20261027/._2026-10-27_TVERZ_Export.xml': 'resource fork',
  'Bundes-Klinik-Atlas_Datenexport_20261027/2026-10-27_TVERZ_Export.xml': ATLAS_XML,
});
const PAGE = '<a href="/fileadmin/dataextracts/Bundes-Klinik-Atlas_Datenexport_20261027.zip">Download</a>';

function respond(overrides: { wfs?: () => Response; zip?: () => Response } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('https://geodienste.hamburg.de/')) return overrides.wfs?.() ?? new Response(WFS);
    if (url.endsWith('/open-data/')) return new Response(PAGE);
    if (url.endsWith('.zip')) return overrides.zip?.() ?? new Response(ZIP);
    return new Response('', { status: 404 });
  });
}

const HAMBURG_IDS = ['hh-BD8A3B84-906F-43CA-83E1-001C26FBD504', 'hh-3255BCAC-DC11-4A84-A898-1AD16F1B0406', 'hh-4A2010FA-54F9-449E-AFDD-250BDC17D8A3'];

describe('createHospitalIngestion', () => {
  beforeEach(() => mockSave.mockClear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('by default downloads the export once for all cities and stores every source\'s records', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    const fetchSpy = respond();
    const cache = createCache();
    const db = {} as Db;
    await createHospitalIngestion(cache, db)();

    expect(fetchSpy.mock.calls.filter(([u]) => String(u).endsWith('.zip'))).toHaveLength(1);
    const berlin = cache.get<HospitalData>('berlin:hospitals')!;
    expect(berlin.hospitals.map((h) => [h.id, h.tier])).toEqual([['kla-1', 'comprehensive'], ['kla-2', 'basic']]);
    expect(berlin.atlasDate).toBe('2026-10-27');
    const hamburg = cache.get<HospitalData>('hamburg:hospitals')!;
    // Stored unmerged (the route merges): the WFS record at the Atlas site is kept
    expect(hamburg.hospitals.map((h) => h.id).sort()).toEqual([...HAMBURG_IDS, 'kla-3'].sort());
    expect(mockSave).toHaveBeenCalledWith(db, 'hamburg', hamburg);
  });

  it('with KLINIK_ATLAS=false reads only Hamburg\'s WFS, and never the Klinik-Atlas', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    vi.stubEnv('KLINIK_ATLAS', 'false');
    const fetchSpy = respond();
    const cache = createCache();
    await createHospitalIngestion(cache)();

    expect(fetchSpy.mock.calls.map(([u]) => String(u)).every((u) => u.startsWith('https://geodienste.hamburg.de/'))).toBe(true);
    const data = cache.get<HospitalData>('hamburg:hospitals')!;
    expect(data.hospitals.map((h) => h.tier)).toEqual(['emergency', 'limited', 'none']);
    expect(data.atlasDate).toBeNull();
    expect(cache.get('berlin:hospitals')).toBeNull();
  });

  it('keeps a failed source\'s hospitals from the last run, and stores nothing when every source fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    respond();
    const cache = createCache();
    await createHospitalIngestion(cache)();
    vi.restoreAllMocks();

    respond({ zip: () => new Response('', { status: 503 }) });
    await createHospitalIngestion(cache)();
    let data = cache.get<HospitalData>('hamburg:hospitals')!;
    expect(data.hospitals.map((h) => h.id)).toContain('kla-3');
    expect(data.atlasDate).toBe('2026-10-27');
    vi.restoreAllMocks();

    // A failed WFS keeps all three of its records, including the one the Atlas site outranks
    respond({ wfs: () => new Response('', { status: 500 }) });
    await createHospitalIngestion(cache)();
    data = cache.get<HospitalData>('hamburg:hospitals')!;
    expect(data.hospitals.filter((h) => h.source === 'hamburg-wfs')).toHaveLength(3);
    vi.restoreAllMocks();

    respond({ zip: () => new Response('', { status: 503 }), wfs: () => new Response('', { status: 500 }) });
    const fresh = createCache();
    await createHospitalIngestion(fresh)();
    expect(fresh.get('hamburg:hospitals')).toBeNull();
  });
});

describe('activeHospitalSources and servedHospitals', () => {
  const city = { dataSources: { hospitals: [{ provider: 'hamburg-wfs', url: 'u' }, { provider: 'klinik-atlas', places: ['Hamburg'] }] } } as unknown as CityConfig;
  const base = { children: false, strokeUnit: false, chestPainUnit: false, trauma: false, beds: null, url: null, address: null };
  const stored: HospitalData = {
    hospitals: [
      { ...base, id: 'hh-1', name: 'Same site', lat: 53.5782, lon: 10.0541, tier: 'emergency', source: 'hamburg-wfs' },
      { ...base, id: 'hh-2', name: 'Elsewhere', lat: 53.6, lon: 10.1, tier: 'none', source: 'hamburg-wfs' },
      { ...base, id: 'kla-1', name: 'Atlas', lat: 53.578, lon: 10.054, tier: 'comprehensive', source: 'klinik-atlas' },
    ],
    atlasDate: '2026-10-27',
  };

  it('leaves out the Klinik-Atlas only with KLINIK_ATLAS=false', () => {
    expect(activeHospitalSources(city, {}).map((s) => s.provider)).toEqual(['hamburg-wfs', 'klinik-atlas']);
    expect(activeHospitalSources(city, { KLINIK_ATLAS: 'true' }).map((s) => s.provider)).toEqual(['hamburg-wfs', 'klinik-atlas']);
    expect(activeHospitalSources(city, { KLINIK_ATLAS: 'False' }).map((s) => s.provider)).toEqual(['hamburg-wfs']);
  });

  it('serves the active sources merged, the Atlas site winning within 250 m', () => {
    expect(servedHospitals(stored, city, {}).hospitals.map((h) => h.id)).toEqual(['kla-1', 'hh-2']);
    expect(servedHospitals(stored, city, { KLINIK_ATLAS: 'false' })).toEqual({
      hospitals: [stored.hospitals[0], stored.hospitals[1]], atlasDate: null,
    });
  });
});
