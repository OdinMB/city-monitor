import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityConfig, HospitalData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { activeHospitalSources, createHospitalIngestion, klinikAtlasEnabled } from './ingest-hospitals.js';

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

describe('createHospitalIngestion', () => {
  beforeEach(() => mockSave.mockClear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('reads only Hamburg\'s WFS without KLINIK_ATLAS_ENABLED, and never the Klinik-Atlas', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    vi.stubEnv('KLINIK_ATLAS_ENABLED', '');
    const fetchSpy = respond();
    const cache = createCache();
    const db = {} as Db;
    await createHospitalIngestion(cache, db)();

    expect(fetchSpy.mock.calls.map(([u]) => String(u)).every((u) => u.startsWith('https://geodienste.hamburg.de/'))).toBe(true);
    const data = cache.get<HospitalData>('hamburg:hospitals')!;
    expect(data.hospitals.map((h) => h.tier)).toEqual(['emergency', 'limited', 'none']);
    expect(data.atlasDate).toBeNull();
    expect(mockSave).toHaveBeenCalledWith(db, 'hamburg', data);
    expect(cache.get('berlin:hospitals')).toBeNull();
  });

  it('with KLINIK_ATLAS_ENABLED=true, downloads the export once and prefers its tier over the WFS record', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    vi.stubEnv('KLINIK_ATLAS_ENABLED', 'true');
    const fetchSpy = respond();
    const cache = createCache();
    await createHospitalIngestion(cache)();

    expect(fetchSpy.mock.calls.filter(([u]) => String(u).endsWith('.zip'))).toHaveLength(1);
    const berlin = cache.get<HospitalData>('berlin:hospitals')!;
    expect(berlin.hospitals.map((h) => [h.id, h.tier])).toEqual([['kla-1', 'comprehensive'], ['kla-2', 'basic']]);
    expect(berlin.atlasDate).toBe('2026-10-27');
    const hamburg = cache.get<HospitalData>('hamburg:hospitals')!;
    expect(hamburg.hospitals.map((h) => h.id)).toEqual([
      'kla-3', 'hh-3255BCAC-DC11-4A84-A898-1AD16F1B0406', 'hh-4A2010FA-54F9-449E-AFDD-250BDC17D8A3',
    ]);
  });

  it('keeps a failed source\'s hospitals from the last run, and stores nothing when every source fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    vi.stubEnv('KLINIK_ATLAS_ENABLED', 'true');
    respond();
    const cache = createCache();
    await createHospitalIngestion(cache)();
    vi.restoreAllMocks();

    respond({ zip: () => new Response('', { status: 503 }) });
    await createHospitalIngestion(cache)();
    const data = cache.get<HospitalData>('hamburg:hospitals')!;
    expect(data.hospitals.map((h) => h.id)).toContain('kla-3');
    expect(data.atlasDate).toBe('2026-10-27');
    vi.restoreAllMocks();

    respond({ zip: () => new Response('', { status: 503 }), wfs: () => new Response('', { status: 500 }) });
    const fresh = createCache();
    await createHospitalIngestion(fresh)();
    expect(fresh.get('hamburg:hospitals')).toBeNull();
  });
});

describe('activeHospitalSources', () => {
  const city = { dataSources: { hospitals: [{ provider: 'hamburg-wfs', url: 'u' }, { provider: 'klinik-atlas', places: ['Hamburg'] }] } } as unknown as CityConfig;

  it('leaves out the Klinik-Atlas unless KLINIK_ATLAS_ENABLED is "true"', () => {
    expect(activeHospitalSources(city, {}).map((s) => s.provider)).toEqual(['hamburg-wfs']);
    expect(activeHospitalSources(city, { KLINIK_ATLAS_ENABLED: 'yes' }).map((s) => s.provider)).toEqual(['hamburg-wfs']);
    expect(activeHospitalSources(city, { KLINIK_ATLAS_ENABLED: 'TRUE' }).map((s) => s.provider)).toEqual(['hamburg-wfs', 'klinik-atlas']);
    expect(klinikAtlasEnabled({ KLINIK_ATLAS_ENABLED: 'true' })).toBe(true);
  });
});
