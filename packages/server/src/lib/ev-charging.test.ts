import { describe, it, expect } from 'vitest';
import {
  createCsvRecordReader, createRegisterCollector, evseStation, findRegisterCsv, hamburgPlugs,
  mergeEvChargingStatus, ocppStatus, parseHamburgChargingStatus, registerPlug,
  type EvChargingRegister, type LiveStation, type RegisterTarget,
} from './ev-charging.js';

const HAMBURG_BOX = { north: 53.75, south: 53.39, east: 10.33, west: 9.73 };
const MUENCHEN_BOX = { north: 48.25, south: 48.06, east: 11.73, west: 11.36 };

const HEADER = 'Ladeeinrichtungs-ID;Betreiber;Anzeigename (Karte);Status;Art der Ladeeinrichtung;Anzahl Ladepunkte;Nennleistung Ladeeinrichtung [kW];Inbetriebnahmedatum;Straße;Hausnummer;Adresszusatz;Postleitzahl;Ort;Kreis/kreisfreie Stadt;Bundesland;Breitengrad;Längengrad;Standortbezeichnung;Informationen zum Parkraum;Bezahlsysteme;Öffnungszeiten;Öffnungszeiten: Wochentage;Öffnungszeiten: Tageszeiten;Steckertypen1;Nennleistung Stecker1;EVSE-ID1;Public Key1;Steckertypen2;Nennleistung Stecker2;EVSE-ID2;Public Key2;Steckertypen3;Nennleistung Stecker3;EVSE-ID3;Public Key3;Steckertypen4;Nennleistung Stecker4;EVSE-ID4;Public Key4;Steckertypen5;Nennleistung Stecker5;EVSE-ID5;Public Key5;Steckertypen6;Nennleistung Stecker6;EVSE-ID6;Public Key6';

/**
 * Rows of the 2026-09-01 register (CC BY 4.0, Bundesnetzagentur.de), trimmed;
 * the "In Wartung" row and the one with a misplaced coordinate are edited
 * copies. The HEnW row's first EVSE id ends in a line break inside its quotes,
 * as about 5,000 rows' do.
 */
const REGISTER = [
  '﻿Ladesäulenregister Bundesnetzagentur;;;;',
  ';;;;',
  'Letzte Aktualisierung vom: 01.09.2026;;;;',
  'Allgemeine Informationen;;;;;;;;;;;;;;;;;;;;;;;1. Ladepunkt;;;;2. Ladepunkt;;;',
  HEADER,
  '1009424;Hamburger Energiewerke Mobil GmbH;HEnW-Mobil;In Betrieb;Normalladeeinrichtung;2;44;29.09.2015;Altstädter Str.;2;;20095;Hamburg;Kreisfreie Stadt Hamburg;Hamburg;53,549381;10,004708;;Keine Beschränkung;"Sonstige;RFID-Karte;Onlinezahlungsverfahren";247;"Montag; Dienstag";"00:00-23:59; 00:00-23:59";AC Typ 2 Steckdose;22;"DE*HHM*E977*01\r\n";;AC Typ 2 Steckdose;22;DE*HHM*E977*02;;;;;;;;;;;;;;;;;',
  '1077333;Q-Park Recharge Germany GmbH;Q-Park Recharge Germany GmbH;In Betrieb;Normalladeeinrichtung;1;11;24.09.2024;Gertrudenstr.;2;Parkhaus;20095;Hamburg;Kreisfreie Stadt Hamburg;Hamburg;53,552972;10,001237;Hamburg City Parkhaus;Keine Beschränkung;Onlinezahlungsverfahren;247;;;AC Typ 2 Steckdose;11;;;;;;;;;;;;;;;;;;;;;;',
  '1077336;Q-Park Recharge Germany GmbH;Q-Park Recharge Germany GmbH;In Betrieb;Normalladeeinrichtung;1;11;24.09.2024;Gertrudenstr.;2;Parkhaus;20095;Hamburg;Kreisfreie Stadt Hamburg;Hamburg;53,552972;10,001237;Hamburg City Parkhaus;Keine Beschränkung;"Onlinezahlungsverfahren;RFID-Karte";247;;;AC Typ 2 Steckdose;11;;;;;;;;;;;;;;;;;;;;;;',
  '1077337;Q-Park Recharge Germany GmbH;Q-Park Recharge Germany GmbH;In Wartung;Normalladeeinrichtung;1;11;24.09.2024;Gertrudenstr.;4;Parkhaus;20095;Hamburg;Kreisfreie Stadt Hamburg;Hamburg;53,553972;10,001237;;;;247;;;AC Typ 2 Steckdose;11;;;;;;;;;;;;;;;;;;;;;;',
  '1147931;Vattenfall Smarter Living GmbH;;In Betrieb;Schnellladeeinrichtung;2;120;20.06.2025;Arnulfstr.;2;;80335;München;Kreisfreie Stadt München;Bayern;48,141827;11,559968;;Keine Beschränkung;"Kreditkarte (NFC);RFID-Karte";247;;;DC Fahrzeugkupplung Typ Combo 2 (CCS);120;;;DC Fahrzeugkupplung Typ Combo 2 (CCS);120;;;;;;;;;;;;;;;;;;',
  '1002851;SWM Versorgungs GmbH;Stadtwerke München;In Betrieb;Normalladeeinrichtung;2;22;31.01.2020;Karl-Hromadnik-Str.;2;;80241;München;Kreisfreie Stadt München;Bayern;48,137018;11,456796;;;;Keine Angabe;;;AC Typ 2 Steckdose;22;;;AC Typ 2 Steckdose;22;;;;;;;;;;;;;;;;;;',
  '1002852;SWM Versorgungs GmbH;Stadtwerke München;In Betrieb;Normalladeeinrichtung;2;22;31.01.2020;Karl-Hromadnik-Str.;2;;80241;München;Kreisfreie Stadt München;Bayern;8,137018;11,456796;;;;Keine Angabe;;;AC Typ 2 Steckdose;22;;;AC Typ 2 Steckdose;22;;;;;;;;;;;;;;;;;;',
  '1025447;EnBW mobility+ AG und Co.KG ;;In Betrieb;Schnellladeeinrichtung;2;172;18.12.2019;Flurstück;313;;89129;Langenau/Seligweiler;Landkreis Alb-Donau-Kreis;Baden-Württemberg;48,456817;10,029649;;;"Onlinezahlungsverfahren;RFID-Karte";Keine Angabe;;;"DC Fahrzeugkupplung Typ Combo 2 (CCS); DC CHAdeMO";"150; 150";;;AC Typ 2 Steckdose;22;;;;;;;;;;;;;;;;;;',
].join('\r\n') + '\r\n';

const TARGETS: RegisterTarget[] = [
  { cityId: 'hamburg', kreis: 'Kreisfreie Stadt Hamburg', box: HAMBURG_BOX, keepEvse: true },
  { cityId: 'muenchen', kreis: 'Kreisfreie Stadt München', box: MUENCHEN_BOX, keepEvse: false },
];

/** Feed `text` to a reader in chunks of `size` characters, collecting the records. */
function readAll(text: string, size: number): string[][] {
  const reader = createCsvRecordReader();
  const records: string[][] = [];
  for (let i = 0; i < text.length; i += size) records.push(...reader.push(text.slice(i, i + size)));
  records.push(...reader.end());
  return records;
}

function collect(text: string, targets = TARGETS) {
  const collector = createRegisterCollector(targets);
  for (const r of readAll(text, 97)) collector.add(r);
  return collector.result();
}

describe('createCsvRecordReader', () => {
  it('keeps separators, doubled quotes and line breaks inside quotes', () => {
    expect(readAll('a;"b;c";"say ""hi"""\r\n"x\ny";2\n', 1000)).toEqual([['a', 'b;c', 'say "hi"'], ['x\ny', '2']]);
  });

  it('gives the same records whatever the chunk size, a quote split from its twin included', () => {
    const text = 'a;"q""q";"multi\r\nline"\r\nlast;row';
    const whole = readAll(text, 10_000);
    expect(whole).toEqual([['a', 'q"q', 'multi\r\nline'], ['last', 'row']]);
    for (const size of [1, 2, 3, 5, 7]) expect(readAll(text, size), `chunk ${size}`).toEqual(whole);
  });

  it('reads the register sample the same in any chunk size', () => {
    const whole = readAll(REGISTER, 1_000_000);
    expect(whole.length).toBe(13);
    for (const size of [1, 13, 64]) expect(readAll(REGISTER, size)).toEqual(whole);
  });
});

describe('findRegisterCsv', () => {
  it('takes the newest CSV the landing page links, not the XLSX', () => {
    const html = `
      <a href="https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-08-01.csv">alt</a>
      <a href="https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-09-01.csv" class="downloadLink">CSV</a>
      <a href="https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-09-30.xlsx">XLSX</a>`;
    expect(findRegisterCsv(html)).toEqual({
      url: 'https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-09-01.csv',
      edition: '2026-09-01',
    });
  });

  it('resolves a relative link against the page and returns null without one', () => {
    const html = '<a href="/SharedDocs/Downloads/Ladesaeulenregister_BNetzA_2026-10-01.csv?__blob=publicationFile&amp;v=2">CSV</a>';
    expect(findRegisterCsv(html)?.url).toBe('https://www.bundesnetzagentur.de/SharedDocs/Downloads/Ladesaeulenregister_BNetzA_2026-10-01.csv?__blob=publicationFile&v=2');
    expect(findRegisterCsv('<html>no file</html>')).toBeNull();
  });
});

describe('createRegisterCollector', () => {
  it('keeps the configured Kreise, in operation and inside the box', () => {
    const byCity = collect(REGISTER);
    // The Alb-Donau row is in no target Kreis; the In Wartung row and the one at 8° N are dropped
    expect(byCity.get('hamburg')!.map((s) => s.id)).toEqual(['1009424', '1077333']);
    expect(byCity.get('muenchen')!.map((s) => s.id)).toEqual(['1147931', '1002851']);
  });

  it('adds up one operator\'s devices at one place into a station', () => {
    const qpark = collect(REGISTER).get('hamburg')!.find((s) => s.id === '1077333')!;
    expect(qpark).toEqual({
      id: '1077333', lat: 53.55297, lon: 10.00124, operator: 'Q-Park Recharge Germany GmbH', address: 'Gertrudenstr. 2',
      points: 2, maxKw: 11, fast: false, plugs: ['type2'],
    });
  });

  it('takes the map name, the plug power and the EVSE station ids where a live feed needs them', () => {
    const henw = collect(REGISTER).get('hamburg')!.find((s) => s.id === '1009424')!;
    // 44 kW is the device's total; each point gives 22
    expect(henw).toMatchObject({ operator: 'HEnW-Mobil', address: 'Altstädter Str. 2', points: 2, maxKw: 22, fast: false, evse: ['DE*HHM*E977'] });
  });

  it('marks fast chargers, falls back to the company name and keeps no EVSE ids where no live feed merges', () => {
    const [vattenfall, swm] = collect(REGISTER).get('muenchen')!;
    expect(vattenfall).toEqual({
      id: '1147931', lat: 48.14183, lon: 11.55997, operator: 'Vattenfall Smarter Living GmbH', address: 'Arnulfstr. 2',
      points: 2, maxKw: 120, fast: true, plugs: ['ccs'],
    });
    expect(swm!.operator).toBe('Stadtwerke München');
    expect(swm).not.toHaveProperty('evse');
  });

  it('throws on a file without the register header, and on a header without a column it reads', () => {
    expect(() => collect('just;some;csv\n1;2;3\n')).toThrow(/no header row/);
    expect(() => collect(`${HEADER.replace('Breitengrad', 'Latitude')}\n`)).toThrow(/Breitengrad/);
  });
});

describe('plug and status mapping', () => {
  it('maps the register\'s plug spellings', () => {
    expect(registerPlug('AC Typ 2 Steckdose')).toBe('type2');
    expect(registerPlug('AC Typ 2 Fahrzeugkupplung')).toBe('type2');
    expect(registerPlug('DC Fahrzeugkupplung Typ Combo 2 (CCS)')).toBe('ccs');
    expect(registerPlug('DC CHAdeMO')).toBe('chademo');
    expect(registerPlug('AC Schuko')).toBe('schuko');
    expect(registerPlug('AC Typ 1 Steckdose')).toBe('type1');
    expect(registerPlug('DC Megawatt Charging System (MCS)')).toBe('mcs');
    expect(registerPlug('Sonstige')).toBeNull();
  });

  it('maps Hamburg\'s connector types', () => {
    expect(hamburgPlugs('S_TYPE_2')).toEqual(['type2']);
    expect(hamburgPlugs('S_TYPE_2_CEE_7_7')).toEqual(['type2', 'schuko']);
    expect(hamburgPlugs('C_CCS_2')).toEqual(['ccs']);
    expect(hamburgPlugs(undefined)).toEqual([]);
  });

  it('folds OCPP statuses into four', () => {
    expect(ocppStatus('AVAILABLE')).toBe('available');
    for (const s of ['CHARGING', 'SUSPENDEDEV', 'SUSPENDEDEVSE', 'PREPARING', 'FINISHING', 'RESERVED', 'OCCUPIED']) expect(ocppStatus(s), s).toBe('occupied');
    expect(ocppStatus('FAULTED')).toBe('outOfOrder');
    expect(ocppStatus('UNAVAILABLE')).toBe('outOfOrder');
    expect(ocppStatus('UNKNOWN')).toBe('unknown');
    expect(ocppStatus(undefined)).toBe('unknown');
  });

  it('takes the station part of an EVSE id', () => {
    expect(evseStation('DE*HHM*E977*01')).toBe('DE*HHM*E977');
    expect(evseStation(' de*hhm*e977*02\n')).toBe('DE*HHM*E977');
    // Three segments or none: no point number to drop
    expect(evseStation('DE*WAT*EW049241002')).toBe('DE*WAT*EW049241002');
    expect(evseStation('DEAEWE002501')).toBe('DEAEWE002501');
  });
});

/** Datastreams as the status query returns them (iot.hamburg.de, 2026-11-03, dl-de/by-2.0), trimmed. */
function datastream(name: string, result: string | null, opts: { current?: string; connectorType?: string; coords?: [number, number]; address?: string } = {}) {
  return {
    name: `Ladepunkt ${name}`,
    properties: { current: opts.current ?? 'AC', connectorType: opts.connectorType ?? 'S_TYPE_2' },
    Thing: {
      '@iot.id': 1,
      Locations: [{
        description: opts.address ?? 'Altstädter Straße 2, 20095 Hamburg',
        location: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: opts.coords ?? [10.004708, 53.549381] } },
      }],
    },
    Observations: result === null ? [] : [{ phenomenonTime: '2026-11-02T21:17:36.581Z', result }],
  };
}

describe('parseHamburgChargingStatus', () => {
  it('groups charge points by station and maps their status', () => {
    const into = new Map<string, LiveStation>();
    const ok = parseHamburgChargingStatus({
      value: [
        datastream('DE*HHM*E977*01', 'AVAILABLE'),
        datastream('DE*HHM*E977*02', 'SUSPENDEDEV', { connectorType: 'S_TYPE_2_CEE_7_7' }),
        datastream('DE*HHM*EQ010*01', null, { current: 'DC', connectorType: 'C_CCS_2', coords: [10.0412, 53.5891], address: 'Fersenfeldtsweg 6, 22303 Hamburg' }),
        // Outside the box (and so outside the city)
        datastream('DE*HHM*E1*01', 'AVAILABLE', { coords: [11.5, 48.1] }),
      ],
    }, HAMBURG_BOX, into);
    expect(ok).toBe(true);
    expect([...into.keys()]).toEqual(['DE*HHM*E977', 'DE*HHM*EQ010']);
    expect(into.get('DE*HHM*E977')).toEqual({
      station: 'DE*HHM*E977', lat: 53.54938, lon: 10.00471, address: 'Altstädter Straße 2', plugs: ['type2', 'schuko'], dc: false,
      points: [
        { id: 'DE*HHM*E977*01', status: 'available', since: Date.parse('2026-11-02T21:17:36.581Z') / 1000 | 0 },
        { id: 'DE*HHM*E977*02', status: 'occupied', since: Date.parse('2026-11-02T21:17:36.581Z') / 1000 | 0 },
      ],
    });
    expect(into.get('DE*HHM*EQ010')).toMatchObject({ dc: true, plugs: ['ccs'], points: [{ id: 'DE*HHM*EQ010*01', status: 'unknown', since: null }] });
  });

  it('refuses a body that is not a SensorThings collection', () => {
    expect(parseHamburgChargingStatus({ error: 'x' }, HAMBURG_BOX, new Map())).toBe(false);
    expect(parseHamburgChargingStatus(null, HAMBURG_BOX, new Map())).toBe(false);
  });
});

describe('mergeEvChargingStatus', () => {
  const register: EvChargingRegister = {
    edition: '2026-09-01',
    stations: [
      { id: '1009424', lat: 53.54938, lon: 10.00471, operator: 'HEnW-Mobil', address: 'Altstädter Str. 2', points: 2, maxKw: 22, fast: false, plugs: ['type2'], evse: ['DE*HHM*E977'] },
      { id: '1077333', lat: 53.55297, lon: 10.00124, operator: 'Q-Park', address: 'Gertrudenstr. 2', points: 2, maxKw: 11, fast: false, plugs: ['type2'] },
    ],
  };
  const live = (station: string, ids: string[], extra: Partial<LiveStation> = {}): LiveStation => ({
    station, lat: 53.5891, lon: 10.0412, address: 'Fersenfeldtsweg 6', plugs: ['ccs'], dc: true,
    points: ids.map((id) => ({ id, status: 'available', since: 1 })), ...extra,
  });

  it('drops the EVSE ids and adds no live status without one', () => {
    const merged = mergeEvChargingStatus(register, null, 'HEnW-Mobil');
    expect(merged).toEqual({ edition: '2026-09-01', stations: register.stations.map(({ evse: _e, ...s }) => s) });
    expect(merged).not.toHaveProperty('liveUpdated');
  });

  it('puts each live station\'s points on its register station, sorted, and adds the ones the register lacks', () => {
    const status = { stations: [live('DE*HHM*E977', ['DE*HHM*E977*02', 'DE*HHM*E977*01']), live('DE*HHM*EQ010', ['DE*HHM*EQ010*01'])], updated: '2026-11-03T02:00:00.000Z' };
    const merged = mergeEvChargingStatus(register, status, 'HEnW-Mobil');
    expect(merged.liveUpdated).toBe('2026-11-03T02:00:00.000Z');
    expect(merged.stations[0]!.live!.map((p) => p.id)).toEqual(['DE*HHM*E977*01', 'DE*HHM*E977*02']);
    expect(merged.stations[1]).not.toHaveProperty('live');
    expect(merged.stations[2]).toEqual({
      id: 'live:DE*HHM*EQ010', lat: 53.5891, lon: 10.0412, operator: 'HEnW-Mobil', address: 'Fersenfeldtsweg 6',
      points: 1, maxKw: null, fast: true, plugs: ['ccs'], live: [{ id: 'DE*HHM*EQ010*01', status: 'available', since: 1 }],
    });
    // The cached register is left as it was
    expect(register.stations[0]).not.toHaveProperty('live');
    expect(register.stations[0]!.evse).toEqual(['DE*HHM*E977']);
  });
});
