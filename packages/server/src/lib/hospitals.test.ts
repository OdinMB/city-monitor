import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Hospital } from '@city-monitor/shared';
import {
  findKlinikAtlasExport, hamburgTier, klinikAtlasTier, mergeHospitals, parseHamburgHospitals, parseKlinikAtlas,
} from './hospitals.js';

// Hamburg's WFS, recorded 2026-11-03 (3 of 37 hospitals, trimmed properties), dl-de/by-2.0
const HAMBURG = JSON.parse(readFileSync(new URL('./hospital-fixtures/hamburg-wfs.json', import.meta.url), 'utf8')) as unknown;

// The Klinik-Atlas export's structure (2026-10-27_TVERZ_Export.xml) with made-up
// sites: the export states no reuse terms, so none of its records is committed.
const ATLAS = `<?xml version="1.0" encoding="UTF-8"?>
<Standorte>
  <Standort>
    <StandortKontaktDaten STOID="900001" Land="HH" Name="Beispielklinikum Nord &amp; Co." Strasse="Musterweg 1" PLZ="22081" Ort="Hamburg" URL="www.beispiel-klinikum.de" Laengengrad="10.054193972755" Breitengrad="53.577923798759"/>
    <StandortStrukturDaten AnzahlBetten="650" AnzahlFaelle="20000"/>
    <StandortNotfallversorgung Stufe="3" Schwerverletztenversorgung="1" Kinder="2" Spezialversorgung="0" StrokeUnit="1" ChestPainUnit="1" StufeNichtVereinbart="0"/>
    <Barrierefreiheit><BF Schluessel="BF34"/></Barrierefreiheit>
    <Erkrankungen><Erkrankung Name="x" Gruppe="y" Anzahl="1"/></Erkrankungen>
  </Standort>
  <Standort>
    <StandortKontaktDaten STOID="900002" Land="HH" Name="Beispiel Fachklinik" Strasse="Testallee 5" PLZ="22111" Ort="Hamburg" URL="http://info@beispiel-fachklinik.de" Laengengrad="10.1" Breitengrad="53.55"/>
    <StandortNotfallversorgung Stufe="0" Schwerverletztenversorgung="0" Kinder="0" Spezialversorgung="1" StrokeUnit="0" ChestPainUnit="0" StufeNichtVereinbart="1"/>
  </Standort>
  <Standort>
    <StandortKontaktDaten STOID="900003" Land="HH" Name="Beispiel Tagesklinik" Strasse="" PLZ="22222" Ort="Hamburg" URL="" Laengengrad="10.0" Breitengrad="53.6"/>
  </Standort>
  <Standort>
    <StandortKontaktDaten STOID="900004" Land="SH" Name="Klinik anderswo" Strasse="Weg 2" PLZ="25421" Ort="Pinneberg" URL="https://anderswo.de" Laengengrad="9.8" Breitengrad="53.66"/>
    <StandortNotfallversorgung Stufe="2" Schwerverletztenversorgung="0" Kinder="0" Spezialversorgung="0" StrokeUnit="0" ChestPainUnit="0" StufeNichtVereinbart="0"/>
  </Standort>
</Standorte>`;

describe('findKlinikAtlasExport', () => {
  it('takes the newest Datenexport ZIP the page links, with its date', () => {
    const html = '<a href="/fileadmin/dataextracts/Bundes-Klinik-Atlas_Datenexport_20260601.zip">alt</a>'
      + '<a href="/fileadmin/dataextracts/Bundes-Klinik-Atlas_Datenexport_20261027.zip">neu</a>';
    expect(findKlinikAtlasExport(html)).toEqual({
      url: 'https://bundes-klinik-atlas.de/fileadmin/dataextracts/Bundes-Klinik-Atlas_Datenexport_20261027.zip',
      date: '2026-10-27',
    });
    expect(findKlinikAtlasExport('<a href="/other.zip">x</a>')).toBeNull();
  });
});

describe('tiers', () => {
  it.each([
    [{ Stufe: '3' }, 'comprehensive'], [{ Stufe: '2' }, 'extended'], [{ Stufe: '1' }, 'basic'],
    [{ Stufe: '0', Spezialversorgung: '1' }, 'specialised'], [{ Stufe: '0', Kinder: '1' }, 'specialised'],
    [{ Stufe: '0', Spezialversorgung: '0', Kinder: '0' }, 'none'], [{ Stufe: '9' }, 'none'], [undefined, 'none'],
  ] as const)('Klinik-Atlas %o → %s', (n, tier) => {
    expect(klinikAtlasTier(n)).toBe(tier);
  });

  it.each([
    ['Teilnahme an der Not- und Unfallversorgung', 'emergency'],
    ['eingeschränkte Teilnahme an der Not- und Unfallversorgung', 'limited'],
    ['keine Teilnahme an der Not- und Unfallversorgung', 'none'],
    ['', 'none'],
  ] as const)('Hamburg "%s" → %s', (text, tier) => {
    expect(hamburgTier(text)).toBe(tier);
  });
});

describe('parseKlinikAtlas', () => {
  it('keeps the sites in the given places, with tier, units, beds and a usable website', () => {
    const hospitals = parseKlinikAtlas(ATLAS, ['Hamburg'])!;
    expect(hospitals.map((h) => h.id)).toEqual(['kla-900001', 'kla-900002', 'kla-900003']);
    expect(hospitals[0]).toEqual({
      id: 'kla-900001', name: 'Beispielklinikum Nord & Co.', address: 'Musterweg 1, 22081 Hamburg',
      lat: 53.577923798759, lon: 10.054193972755, tier: 'comprehensive',
      children: true, strokeUnit: true, chestPainUnit: true, trauma: true, beds: 650,
      url: 'https://www.beispiel-klinikum.de/', source: 'klinik-atlas',
    });
    // An e-mail address in the URL field is no link; a site without the element has no tier
    expect(hospitals[1]).toMatchObject({ tier: 'specialised', url: null, beds: null });
    expect(hospitals[2]).toMatchObject({ tier: 'none', address: '22222 Hamburg', url: null });
  });

  it('returns null for XML that is not the export', () => {
    expect(parseKlinikAtlas('<foo/>', ['Hamburg'])).toBeNull();
  });
});

describe('parseHamburgHospitals', () => {
  it('reads each hospital with its ER participation', () => {
    const hospitals = parseHamburgHospitals(HAMBURG)!;
    expect(hospitals.map((h) => [h.name, h.tier])).toEqual([
      ['Schön Klinik Hamburg Eilbek', 'emergency'],
      ['BG Klinikum Hamburg', 'limited'],
      ['Janssen-Haus Tagesklinik Hamburg-Mitte', 'none'],
    ]);
    expect(hospitals[0]).toMatchObject({
      id: 'hh-BD8A3B84-906F-43CA-83E1-001C26FBD504', address: 'Dehnhaide 120, 22081 Hamburg', lat: 53.578344, lon: 10.053828,
      beds: 719, url: 'https://www.schoen-klinik.de/hamburg-eilbek', source: 'hamburg-wfs',
    });
    expect(hospitals[2]!.beds).toBeNull();
    expect(parseHamburgHospitals({ error: 'x' })).toBeNull();
  });
});

describe('mergeHospitals', () => {
  it('lets a Klinik-Atlas site replace the WFS record at the same place, and orders by tier', () => {
    const atlas = parseKlinikAtlas(ATLAS, ['Hamburg'])!;
    const wfs = parseHamburgHospitals(HAMBURG)!;
    const merged = mergeHospitals([wfs, atlas]);
    // Schön Klinik Eilbek's WFS point is ~50 m from the atlas site 900001: one hospital, with the tier
    expect(merged.map((h: Hospital) => h.id)).toEqual([
      'kla-900001', 'hh-3255BCAC-DC11-4A84-A898-1AD16F1B0406', 'kla-900002',
      'kla-900003', 'hh-4A2010FA-54F9-449E-AFDD-250BDC17D8A3',
    ]);
  });

  it('keeps every record of a single source', () => {
    expect(mergeHospitals([parseHamburgHospitals(HAMBURG)!])).toHaveLength(3);
  });
});
