import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { EvChargingRegister, EvChargingStatus } from '../lib/ev-charging.js';
import { BNETZA_REGISTER_PAGE } from '../lib/ev-charging.js';
import { createEvChargingIngestion, createEvChargingStatusIngestion } from './ingest-ev-charging.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveEvChargingRegister: (...args: unknown[]) => mockSave(...args),
}));

const CSV_URL = 'https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-09-01.csv';
const PAGE = `<a href="${CSV_URL}">CSV</a>`;
const HEADER = 'Ladeeinrichtungs-ID;Betreiber;Anzeigename (Karte);Status;Art der Ladeeinrichtung;Anzahl Ladepunkte;Nennleistung Ladeeinrichtung [kW];Inbetriebnahmedatum;Straße;Hausnummer;Adresszusatz;Postleitzahl;Ort;Kreis/kreisfreie Stadt;Bundesland;Breitengrad;Längengrad;Standortbezeichnung;Informationen zum Parkraum;Bezahlsysteme;Öffnungszeiten;Öffnungszeiten: Wochentage;Öffnungszeiten: Tageszeiten;Steckertypen1;Nennleistung Stecker1;EVSE-ID1;Public Key1;Steckertypen2;Nennleistung Stecker2;EVSE-ID2;Public Key2';
const CSV = [
  'Ladesäulenregister Bundesnetzagentur;;',
  HEADER,
  '1009424;Hamburger Energiewerke Mobil GmbH;HEnW-Mobil;In Betrieb;Normalladeeinrichtung;2;44;29.09.2015;Altstädter Str.;2;;20095;Hamburg;Kreisfreie Stadt Hamburg;Hamburg;53,549381;10,004708;;;;247;;;AC Typ 2 Steckdose;22;DE*HHM*E977*01;;AC Typ 2 Steckdose;22;DE*HHM*E977*02;',
  '1147931;Vattenfall Smarter Living GmbH;;In Betrieb;Schnellladeeinrichtung;2;120;20.06.2025;Arnulfstr.;2;;80335;München;Kreisfreie Stadt München;Bayern;48,141827;11,559968;;;;247;;;DC Fahrzeugkupplung Typ Combo 2 (CCS);120;;;DC Fahrzeugkupplung Typ Combo 2 (CCS);120;;',
].join('\r\n');

const STATUS_PAGE = {
  value: [{
    name: 'Ladepunkt DE*HHM*E977*01',
    properties: { current: 'AC', connectorType: 'S_TYPE_2' },
    Thing: { '@iot.id': 8490, Locations: [{ description: 'Altstädter Straße 2, 20095 Hamburg', location: { type: 'Feature', geometry: { type: 'Point', coordinates: [10.004708, 53.549381] } } }] },
    Observations: [{ phenomenonTime: '2026-11-02T21:17:36.581Z', result: 'CHARGING' }],
  }],
};

/** A streamed body in small chunks, as the 55 MB file arrives. */
function chunked(text: string, size = 50): Response {
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
  return new Response(stream);
}

function respond(overrides: Record<string, () => Response> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    for (const [part, make] of Object.entries(overrides)) if (url.includes(part)) return make();
    if (url === BNETZA_REGISTER_PAGE) return new Response(PAGE);
    if (url === CSV_URL) return chunked(CSV);
    if (url.startsWith('https://iot.hamburg.de/v1.1/Datastreams?')) return new Response(JSON.stringify(STATUS_PAGE));
    return new Response('not found', { status: 404 });
  });
}

describe('createEvChargingIngestion', () => {
  beforeEach(() => mockSave.mockClear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('downloads the register once and stores each configured city\'s stations', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg,muenchen');
    const fetchSpy = respond();
    const cache = createCache();
    const db = {} as Db;
    await createEvChargingIngestion(cache, db)();

    expect(fetchSpy.mock.calls.map(([u]) => String(u))).toEqual([BNETZA_REGISTER_PAGE, CSV_URL]);
    const hamburg = cache.get<EvChargingRegister>('hamburg:ev-charging:register')!;
    expect(hamburg.edition).toBe('2026-09-01');
    // Hamburg has a live feed, so its stations keep their EVSE station ids
    expect(hamburg.stations).toEqual([expect.objectContaining({ id: '1009424', evse: ['DE*HHM*E977'] })]);
    const muenchen = cache.get<EvChargingRegister>('muenchen:ev-charging:register')!;
    expect(muenchen.stations).toEqual([expect.objectContaining({ id: '1147931', fast: true, maxKw: 120 })]);
    expect(muenchen.stations[0]).not.toHaveProperty('evse');
    expect(mockSave).toHaveBeenCalledWith(db, 'hamburg', hamburg);
    expect(mockSave).toHaveBeenCalledWith(db, 'muenchen', muenchen);
  });

  it('keeps the stored edition when the page links no CSV, the download fails or a city has no rows', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const cache = createCache();
    respond({ [BNETZA_REGISTER_PAGE]: () => new Response('<html>relaunched</html>') });
    await createEvChargingIngestion(cache)();
    vi.restoreAllMocks();
    respond({ [CSV_URL]: () => new Response('gone', { status: 404 }) });
    await createEvChargingIngestion(cache)();
    vi.restoreAllMocks();
    // Köln is configured, but the sample has no Köln rows
    respond();
    await createEvChargingIngestion(cache)();
    expect(cache.get('koeln:ev-charging:register')).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('fetches nothing when no active city has the source', async () => {
    // Every configured city has the register, so: no active city at all
    vi.stubEnv('ACTIVE_CITIES', 'nowhere');
    const fetchSpy = respond();
    await createEvChargingIngestion(createCache())();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('createEvChargingStatusIngestion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('caches Hamburg\'s live status and asks nothing for a city without a feed', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    const fetchSpy = respond();
    const cache = createCache();
    await createEvChargingStatusIngestion(cache)();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("properties%2FlayerName+eq+%27Status_E-Ladepunkt%27");
    const status = cache.get<EvChargingStatus>('hamburg:ev-charging:status')!;
    expect(status.stations).toEqual([expect.objectContaining({ station: 'DE*HHM*E977', points: [{ id: 'DE*HHM*E977*01', status: 'occupied', since: 1793654256 }] })]);
    expect(cache.get('berlin:ev-charging:status')).toBeNull();
  });

  it('follows the next link and keeps the last status when a page fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    const cache = createCache();
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ ...STATUS_PAGE, '@iot.nextLink': 'https://iot.hamburg.de/v1.1/Datastreams?$skip=1000' }));
      return new Response('busy', { status: 503 });
    });
    await createEvChargingStatusIngestion(cache)();
    expect(calls).toBe(2);
    expect(cache.get('hamburg:ev-charging:status')).toBeNull();
  });
});
