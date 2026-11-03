import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { HeatReliefSource } from '@city-monitor/shared';
import {
  heatReliefRequests, parseBerlinCoolRooms, parseBerlinFountains, parseBerlinToilets, parseHamburgFountains,
  parseHeatRelief, parseKoelnCoolPlaces, parseKoelnFountains, parseKoelnToilets, parseMuenchenFountains,
  parseMuenchenToilets, parseSeason,
} from './heat-relief-parsers.js';

/**
 * Recorded on 2026-11-03 and trimmed to a few entries: GDI Berlin (dl-de/zero-2.0),
 * Geodienste Hamburg (dl-de/by-2.0), Stadt Köln and AWB Köln (dl-de/zero-2.0),
 * GeodatenService München (dl-de/by-2.0). The München toilets' Brunnerstraße row is
 * set to "defekt" for the out-of-order case.
 */
function raw(name: string): string {
  return readFileSync(new URL(`./heat-relief-fixtures/${name}`, import.meta.url), 'utf8');
}
const fixture = (name: string): unknown => JSON.parse(raw(`${name}.json`));

describe('heatReliefRequests', () => {
  it('asks GDI Berlin for GeoJSON in WGS84', () => {
    const [req] = heatReliefRequests({ kind: 'fountain', provider: 'berlin-fountains', url: 'https://gdi.berlin.de/services/wfs/trinkwasserbrunnen' });
    const url = new URL(req!.url);
    expect(url.searchParams.get('typeNames')).toBe('trinkwasserbrunnen:trinkwasserbrunnen');
    expect(url.searchParams.get('outputFormat')).toBe('application/json');
    expect(url.searchParams.get('srsName')).toBe('EPSG:4326');
  });

  it('asks Köln for each cool-places layer by WFS 1.1.0 with the text properties only (no base64 photos)', () => {
    const reqs = heatReliefRequests({ kind: 'cool', provider: 'koeln-cool-places', url: 'https://geoportal.stadt-koeln.de/wss/service/kuehle_orte_wfs/guest', layers: ['im_innenraum', 'am_wasser'] });
    expect(reqs.map((r) => r.layer)).toEqual(['im_innenraum', 'am_wasser']);
    const url = new URL(reqs[0]!.url);
    expect(url.searchParams.get('version')).toBe('1.1.0');
    expect(url.searchParams.get('typeName')).toBe('ms:im_innenraum');
    expect(url.searchParams.get('outputFormat')).toBe('geojson');
    expect(url.searchParams.get('propertyName')).toBe('Beschreibung_des_kühlen_Ortes,Koordinate_WGS84');
  });

  it('asks München for the shown toilet columns alone', () => {
    const [req] = heatReliefRequests({ kind: 'toilet', provider: 'muenchen-toilets', url: 'https://geoportal.muenchen.de/geoserver/gsm_wfs/ows' });
    expect(new URL(req!.url).searchParams.get('propertyName')).toContain('shape,name,strasse');
  });
});

describe('parseSeason', () => {
  it('reads German month names', () => {
    expect(parseSeason('Betriebszeit: Mai bis Oktober, Link: https://www.bwb.de/de/trinkbrunnen.php  ')).toEqual({ from: 5, to: 10 });
    expect(parseSeason('ganzjährig')).toBeUndefined();
    expect(parseSeason(null)).toBeUndefined();
  });
});

describe('Berlin', () => {
  it('reads cool rooms with address, hours, access and the note on one line', () => {
    expect(parseBerlinCoolRooms(fixture('berlin-cool-rooms'))).toEqual([
      {
        kind: 'cool', lat: 52.47463, lon: 13.31007, name: 'Lindenkirche', address: 'Homburger Str. 48, 14197 Berlin',
        hours: 'Mo - So: 10:00 - 16:00 Uhr', note: 'Es erfolgt keine medizinische Betreuung.', accessible: 'no',
      },
      {
        kind: 'cool', lat: 52.54587, lon: 13.59119, name: 'Stadtteilzentrum Hellersdorfer Terrassen',
        address: 'Alte Hellersdorfer Straße 121, 12629 Berlin', hours: 'Mo - Fr: 10:00 - 18:00 Uhr',
        note: 'Das WC ist nur eingeschränkt mit Rollstühlen nutzbar.; Es erfolgt keine medizinische Betreuung.', accessible: 'partly',
      },
    ]);
  });

  it('reads fountains with their season and marks one out of service', () => {
    const [ok, broken] = parseBerlinFountains(fixture('berlin-fountains'))!;
    expect(ok).toEqual({ kind: 'fountain', lat: 52.43135, lon: 13.41505, name: 'Britzer Garten (nahe Tennishalle)', season: { from: 5, to: 10 } });
    expect(broken).toMatchObject({ outOfOrder: true, note: 'zur Zeit wegen Reparatur außer Betrieb' });
  });

  it('reads toilets: barrierearm is partly accessible, hours joined on one line', () => {
    const [alex, box] = parseBerlinToilets(fixture('berlin-toilets'))!;
    expect(alex).toEqual({
      kind: 'toilet', lat: 52.52146, lon: 13.41295, name: 'WC-Center Alexanderplatz 1',
      hours: 'Mo-Sa 07:00-22:00; So 10:00-22:00', fee: 0.5, accessible: 'partly', changingTable: true,
    });
    expect(box).toMatchObject({ fee: 0, accessible: 'no', changingTable: false, hours: '24h' });
  });

  it('returns null for an answer that is not a FeatureCollection', () => {
    expect(parseBerlinToilets({ error: 'x' })).toBeNull();
    expect(parseBerlinToilets({ type: 'FeatureCollection', features: [{ geometry: null, properties: {} }] })).toEqual([]);
  });
});

describe('Hamburg', () => {
  it('reads the fountains by address', () => {
    expect(parseHamburgFountains(fixture('hamburg-fountains'))).toEqual([
      { kind: 'fountain', lat: 53.57357, lon: 10.00197, name: 'Fährdamm 13' },
      { kind: 'fountain', lat: 53.54527, lon: 9.97193, name: 'Höhe Brücke 1 (Rickmer Rickmers)' },
    ]);
  });
});

describe('Köln', () => {
  it('reads cool places from the WGS84 property, a short first line as the name', () => {
    const [forum, library] = parseKoelnCoolPlaces(fixture('koeln-cool-im_innenraum'), 'im_innenraum')!;
    expect(forum).toMatchObject({ kind: 'cool', lat: 50.88438, lon: 7.05691, name: '', setting: 'indoor' });
    expect(forum!.note).toMatch(/^Hier befindet sich der Begegnungsort Mittendrin/);
    expect(library).toMatchObject({ name: 'Interim Zentralbibliothek', setting: 'indoor' });
    expect(library!.note).toMatch(/^Öffnungszeiten; Dienstag und Donnerstag, 10 bis 20 Uhr; /);
  });

  it('converts the fountains from EPSG:25832', () => {
    const [maternus] = parseKoelnFountains(fixture('koeln-fountains'))!;
    expect(maternus!.name).toBe('Maternusplatz');
    // Maternusplatz in Rodenkirchen, on the Rhine south of the centre
    expect(maternus!.lat).toBeCloseTo(50.893, 2);
    expect(maternus!.lon).toBeCloseTo(6.995, 2);
  });

  it('reads AWB\'s toilet XML: fee from the description, type and the rest as the note', () => {
    expect(parseKoelnToilets(raw('koeln-toilets.xml'))).toEqual([
      { kind: 'toilet', lat: 50.93986, lon: 6.95539, name: 'Richartzstraße SHS-Toilette', address: 'Richartzstraße', hours: 'rund um die Uhr', note: 'City-Toilette' },
      {
        kind: 'toilet', lat: 50.92703, lon: 6.93086, name: 'Holy Shit (Mobile Toilette)', address: 'Bruno-Kisch-Weg',
        hours: 'Mo - So: durchgehend geöffnet', fee: 0, note: 'Toilette in Grünanlagen. kein Winterdienst.',
      },
      {
        kind: 'toilet', lat: 50.96339, lon: 6.95211, name: 'City-Toilette Wilhelmplatz', address: 'Viersener Straße',
        hours: 'Mo, Mi, Fr: 7.30 - 12.00 Uhr; Di: 9.30 - 18.00 Uhr', fee: 0.5, note: 'City-Toilette',
      },
    ]);
  });

  it('returns null for something that is not the toilet list', () => {
    expect(parseKoelnToilets('<html><body>Wartung</body></html>')).toBeNull();
  });
});

describe('München', () => {
  it('reads fountains with their remark', () => {
    expect(parseMuenchenFountains(fixture('muenchen-fountains'))).toEqual([
      { kind: 'fountain', lat: 48.13597, lon: 11.57688, name: 'Elise-Aulinger-Brunnen', note: 'Dauerläufer 24/7' },
      { kind: 'fountain', lat: 48.13106, lon: 11.59612, name: 'Bertschbrunnen' },
    ]);
  });

  it('merges the rooms of one toilet into a place', () => {
    const [grosshadern, brunner] = parseMuenchenToilets(fixture('muenchen-toilets'))!;
    expect(grosshadern).toEqual({
      kind: 'toilet', lat: 48.10885, lon: 11.47266, name: 'Öffentliche Toilette U-Bahnhof Klinikum Großhadern',
      address: 'Max-Lebsche-Platz', hours: 'Täglich 06:00 Uhr bis 24:00 Uhr', fee: 0.6, accessible: 'yes', changingTable: true,
    });
    expect(brunner).toMatchObject({ outOfOrder: true, fee: 0.5 });
    expect(brunner).not.toHaveProperty('changingTable');
  });
});

describe('parseHeatRelief', () => {
  it('dispatches by provider and rejects a body that is not JSON', () => {
    const source: HeatReliefSource = { kind: 'fountain', provider: 'hamburg-fountains', url: 'https://geodienste.hamburg.de/wfs_trinkwasserbrunnen' };
    expect(parseHeatRelief(source, raw('hamburg-fountains.json'))).toHaveLength(2);
    expect(parseHeatRelief(source, '<ExceptionReport/>')).toBeNull();
    const koeln: HeatReliefSource = { kind: 'cool', provider: 'koeln-cool-places', url: 'x', layers: ['am_wasser'] };
    expect(parseHeatRelief(koeln, raw('koeln-cool-im_innenraum.json'), 'am_wasser')![0]!.setting).toBe('water');
  });
});
