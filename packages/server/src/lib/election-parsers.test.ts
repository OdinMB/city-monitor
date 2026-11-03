import { describe, expect, it } from 'vitest';
import type { ElectionResultSource } from '@city-monitor/shared';
import {
  buildElectionResults, normalizeParty, parseBerlinAghSheet, parseHamburgStadtteilSheet, parseMuenchenStadtratCsv,
  stadtteilOutlineIds,
} from './election-parsers.js';

const SOURCE: ElectionResultSource = {
  provider: 'berlin-agh-xlsx', url: 'https://example.org/agh.xlsx', election: 'abgeordnetenhaus', date: '2026-09-20', outlines: 'x.geojson',
};

/** Sheet AGH_W2's layout, trimmed to three parties: a polling and a postal district in Mitte 1, one polling district in Mitte 2. */
const BERLIN_ROWS: unknown[][] = [
  ['Stimmart', 'Adresse', 'Bezirksnummer', 'Bezirksname', 'Wahlbezirk', 'Wahlbezirksart', 'Briefwahlbezirk', 'Abgeordneten-\nhauswahlkreis',
    'Bundestags-\nwahlkreis', 'OstWest', 'Wahlberechtigte insgesamt', 'Wahlberechtigte A1', 'Wahlberechtigte A2', 'Wahlberechtigte A3',
    'Wählende', 'Wählende B1', 'Gültige Stimmen', 'Ungültige Stimmen', 'CDU', 'GRÜNE', 'Die Linke', 'DKP'],
  ['Zweitstimme', '01W101', '01', 'Mitte', '101', 'W', '1A', '1', '74', 'O', 1000, 600, 400, 0, 500, 6, 495, 5, 100, 200, 190, 5],
  ['Zweitstimme', '01B1A', '01', 'Mitte', '1A', 'B', '1A', '1', '74', 'O', 0, 0, 0, 0, 300, 300, 300, 0, 100, 100, 100, 0],
  ['Zweitstimme', '01W201', '01', 'Mitte', '201', 'W', '2A', '2', '74', 'O', 800, 500, 300, 0, 400, 0, 400, 0, 180, 60, 160, 0],
];

describe('normalizeParty', () => {
  it('spells the parties the app colours one way and undoes header line breaks', () => {
    expect(normalizeParty('GRÜNE')).toBe('Grüne');
    expect(normalizeParty('DIE \nLINKE')).toBe('Die Linke');
    expect(normalizeParty('FREIE WÄHLER / FW München')).toBe('Freie Wähler');
    expect(normalizeParty('DieWahl - \nWFG')).toBe('DieWahl WFG');
    expect(normalizeParty(' Volt ')).toBe('Volt');
  });
});

describe('parseBerlinAghSheet', () => {
  it('sums polling and postal districts per Wahlkreis, keyed as the outlines are', () => {
    const raw = parseBerlinAghSheet(BERLIN_ROWS);
    expect(raw.unit).toBe('votes');
    expect(raw.areas.map((a) => [a.id, a.name, a.eligible, a.voters])).toEqual([['0101', 'Mitte 1', 1000, 800], ['0102', 'Mitte 2', 800, 400]]);
    expect([...raw.areas[0]!.parties]).toEqual([['CDU', 200], ['Grüne', 300], ['Die Linke', 290], ['DKP', 5]]);
  });

  it('throws when a column it needs is gone', () => {
    expect(() => parseBerlinAghSheet([['Stimmart', 'Bezirksnummer']])).toThrow(/Bezirksname/);
  });
});

describe('buildElectionResults', () => {
  it('turns votes into shares, turnout, the strongest party and a city total summed from the areas', () => {
    const r = buildElectionResults(parseBerlinAghSheet(BERLIN_ROWS), SOURCE, 'wahlkreis');
    expect(r).toMatchObject({ election: 'abgeordnetenhaus', date: '2026-09-20', areaLevel: 'wahlkreis', sourceUrl: SOURCE.url });
    // DKP has 5 of 1,195 votes city-wide (0.4 %): into "other"
    expect(r.total.shares.map((s) => s.party)).toEqual(['Die Linke', 'CDU', 'Grüne']);
    expect(r.total).toMatchObject({ eligible: 1800, voters: 1200, turnout: 66.67, leader: 'Die Linke', otherPct: 0.42 });
    const mitte1 = r.areas[0]!;
    // In the city's order, not the area's
    expect(mitte1.shares).toEqual([{ party: 'Die Linke', pct: 36.48 }, { party: 'CDU', pct: 25.16 }, { party: 'Grüne', pct: 37.74 }]);
    expect(mitte1).toMatchObject({ turnout: 80, leader: 'Grüne', otherPct: 0.63 });
    expect(r.areas[1]).toMatchObject({ leader: 'CDU', turnout: 50 });
  });

  it('refuses a file without areas', () => {
    expect(() => buildElectionResults({ unit: 'votes', areas: [] }, SOURCE, 'wahlkreis')).toThrow(/no areas/);
  });
});

const HH_OUTLINES = new Map([
  ['101', { name: 'Hamburg-Altstadt' }],
  ['104', { name: 'St. Pauli' }],
  ['115', { name: 'Billbrook' }],
  ['116', { name: 'Rothenburgsort' }],
  ['118', { name: 'Steinwerder/Kl. Grasbrook' }],
  ['702', { name: 'Moorburg/Altenwerder' }],
  ['703', { name: 'Cranz' }],
]);

describe('stadtteilOutlineIds', () => {
  it('finds a Stadtteil by its name, and every outline a group of Stadtteile covers', () => {
    expect(stadtteilOutlineIds('St. Pauli', HH_OUTLINES)).toEqual(['104']);
    expect(stadtteilOutlineIds('Billbrook/Rothenburgsort', HH_OUTLINES)).toEqual(['115', '116']);
    expect(stadtteilOutlineIds('Hamburg-Altstadt/Neuwerk', HH_OUTLINES)).toEqual(['101']);
    expect(stadtteilOutlineIds('Kleiner Grasbrook/Steinwerder', HH_OUTLINES)).toEqual(['118']);
    expect(stadtteilOutlineIds('Moorburg/Altenwerder/Francop/Neuenfelde/Cranz', HH_OUTLINES)).toEqual(['702', '703']);
    expect(stadtteilOutlineIds('Bezirk Altona', HH_OUTLINES)).toEqual([]);
  });
});

describe('parseHamburgStadtteilSheet', () => {
  const rows: unknown[][] = [
    ['Endgültiges Ergebnis der Hamburger Bürgerschaftswahl 2025 nach Stadtteilen'],
    [],
    ['Bezirk/Stadtteil', 'Wahlbe-\nteiligung', 'Brief-wählende', 'SPD', 'CDU', 'GRÜNE', 'Die Linke', 'Übrige'],
    [null, 'Bezirk Hamburg-Mitte'],
    ['Hamburg-Altstadt/Neuwerk', 68.0, 52.9, 25.3, 20.0, 20.2, 13.9, 20.6],
    ['St. Pauli', 70.5, 43.0, 20.2, 5.2, 26.2, 36.0, 12.4],
    ['Billbrook/Rothenburgsort', 45.1, 30.0, 35.0, 15.0, 10.0, '– ', 40.0],
    ['Nowhere', 50, 40, 10, 10, 10, 10, 60],
    ['Bezirk Hamburg-Mitte', 60.0, 40.0, 30.0, 15.0, 20.0, 15.0, 20.0],
    ['Hamburg', 67.6, 43.9, 33.5, 19.8, 18.5, 11.2, 17.0],
    [],
    ['© Statistisches Amt für Hamburg und Schleswig-Holstein 2025'],
  ];

  it('reads the shares per Stadtteil and the city row, without the Bezirk totals', () => {
    const raw = parseHamburgStadtteilSheet(rows, HH_OUTLINES);
    expect(raw.unit).toBe('pct');
    expect(raw.unmatched).toEqual(['Nowhere']);
    expect(raw.areas.map((a) => [a.id, a.name, a.turnout])).toEqual([
      ['101', 'Hamburg-Altstadt/Neuwerk', 68], ['104', 'St. Pauli', 70.5], ['115+116', 'Billbrook/Rothenburgsort', 45.1],
    ]);
    expect([...raw.areas[2]!.parties]).toEqual([['SPD', 35], ['CDU', 15], ['Grüne', 10], ['Die Linke', 0]]);
    expect(raw.total).toMatchObject({ id: 'total', turnout: 67.6, otherPct: 17 });
  });

  it('keeps the source\'s shares and "other" share as they are', () => {
    const r = buildElectionResults(parseHamburgStadtteilSheet(rows, HH_OUTLINES), { ...SOURCE, election: 'buergerschaft' }, 'stadtteil');
    expect(r.total).toMatchObject({ turnout: 67.6, leader: 'SPD', otherPct: 17, eligible: null, voters: null });
    expect(r.areas[1]).toMatchObject({ leader: 'Die Linke', otherPct: 12.4 });
  });
});

describe('parseMuenchenStadtratCsv', () => {
  const header = 'Gebietsartschlüssel;Gebietsnummer;Stimmbezirksart;Wahlberechtigte gesamt;Wahlberechtigte ohne Wahlschein;Wahlberechtigte mit Wahlschein;'
    + 'Wahlberechtigte nicht im Wählerverzeichnis;Wähler gesamt;Wähler mit Wahlschein;Ungültige Stimmen;'
    + 'Partei;Anzahl Stimmen;Prozentzahl;Partei;Anzahl Stimmen;Prozentzahl;Partei;Anzahl Stimmen;Prozentzahl';
  const csv = [
    header,
    'SRSB;162;1;100;60;40;0;50;30;1;CSU;1000;25 %;FREIE WÄHLER / FW München;200;5 %;GRÜNE;2800;70 %',
    'SRSB;1;11;40;25;15;0;12;1;0;CSU;100;20 %;FREIE WÄHLER / FW München;0;0 %;GRÜNE;400;80 %',
    'SRSB;1;1;40;25;15;0;20;9;0;CSU;300;20 %;FREIE WÄHLER / FW München;60;4 %;GRÜNE;1140;76 %',
    'SRSB;2;1;60;35;25;0;30;21;1;CSU;700;28 %;FREIE WÄHLER / FW München;140;5,6 %;GRÜNE;1660;66,4 %',
  ].join('\r\n');

  it('takes each Stadtbezirk\'s polling and postal votes together, named by its outline', () => {
    const raw = parseMuenchenStadtratCsv(`${String.fromCharCode(0xfeff)}${csv}`, new Map([['01', { name: 'Altstadt-Lehel' }]]));
    expect(raw.areas.map((a) => [a.id, a.name, a.eligible, a.voters])).toEqual([['01', 'Altstadt-Lehel', 40, 20], ['02', '02', 60, 30]]);
    expect([...raw.areas[1]!.parties]).toEqual([['CSU', 700], ['Freie Wähler', 140], ['Grüne', 1660]]);
    const r = buildElectionResults(raw, { ...SOURCE, election: 'stadtrat' }, 'stadtbezirk');
    expect(r.total).toMatchObject({ eligible: 100, voters: 50, turnout: 50, leader: 'Grüne' });
    expect(r.total.shares).toEqual([{ party: 'Grüne', pct: 70 }, { party: 'CSU', pct: 25 }, { party: 'Freie Wähler', pct: 5 }]);
  });

  it('throws on a CSV without its columns', () => {
    expect(() => parseMuenchenStadtratCsv('a;b\n1;2', new Map())).toThrow(/Gebietsnummer/);
  });
});
