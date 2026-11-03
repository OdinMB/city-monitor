import { describe, it, expect } from 'vitest';
import { buildCrimeAtlas, newestCrimeYear, parseCrimeSheet } from './crime-atlas.js';
import type { AreaOutline } from './area-outlines.js';

// The layout of the Kriminalitätsatlas sheets (headers break words over lines), trimmed to a few columns
const HEADER = [
  'LOR-Schlüssel (Bezirksregion)', 'Bezeichnung (Bezirksregion)', 'Straftaten \n-insgesamt-', 'Raub',
  'Straßenraub,\nHandtaschen-raub', 'Körper-verletzungen \n-insgesamt-', 'Fahrrad-\ndiebstahl', 'Wohnraum-\neinbruch', 'Kieztaten',
];

function sheet(rows: unknown[][]): unknown[][] {
  return [['Gesamtübersicht: Daten zum Kriminalitätsatlas (PKS 2025)'], ['Häufigkeitszahlen (HZ)'], [], [], HEADER, ...rows];
}

const RATES = sheet([
  ['010000', 'Mitte', 19921.14, 214.9, 129.3, 2104.9, 1067.7, 228.2, 5084],
  ['011001', 'Tiergarten Süd', 31960.157, 399.66, 325.9, 2631.58, 1887.6, 252.09, 8583.37],
  ['011002', 'Südliche  Friedrichstadt', 20818.9, 366.2, 205.1, 2000, 900, 300, 6000],
  ['019900', 'Bezirk (Mi), nicht zuzuordnen', '-', '-', '-', '-', '-', '-', '-'],
  ['999900', 'Stadtgebiet Berlin, nicht zuzuordnen', '-', '-', '-', '-', '-', '-', '-'],
  ['999999', 'Berlin (PKS gesamt)', 12882.1, 123.6, 73.7, 1276.8, 579.9, 272.1, 3174.3],
]);
const COUNTS = sheet([
  ['011001', 'Tiergarten Süd', 5198, 65, 53, 428, 307, 41, 1396],
  ['999999', 'Berlin (PKS gesamt)', 502743, 4823, 2876, 49830, 22630, 10618, 123883],
]);

const square = { type: 'Polygon', coordinates: [[[13.3, 52.5], [13.31, 52.5], [13.31, 52.51], [13.3, 52.5]]] };
const OUTLINES = new Map<string, AreaOutline>([
  ['011001', { id: '011001', name: 'Tiergarten Süd', district: 'Mitte', geometry: square }],
]);

describe('newestCrimeYear', () => {
  it('takes the newest year with both a cases and a rates sheet', () => {
    expect(newestCrimeYear(['Titel', 'Fallzahlen_2024', 'Fallzahlen_2025', 'HZ_2024', 'HZ_2025', 'Fallzahlen_2026'])).toBe(2025);
    expect(newestCrimeYear(['Titel', 'Inhaltsverzeichnis'])).toBeNull();
  });
});

describe('parseCrimeSheet', () => {
  it('reads every six-digit row by its LOR key, with "-" as no figure', () => {
    const rows = parseCrimeSheet(RATES);
    expect([...rows.keys()]).toEqual(['010000', '011001', '011002', '019900', '999900', '999999']);
    expect(rows.get('011001')!.values).toEqual({
      total: 31960.157, assault: 2631.58, robbery: 399.66, burglary: 252.09, bikeTheft: 1887.6, kiez: 8583.37,
    });
    expect(rows.get('019900')!.values.total).toBeNull();
    expect(rows.get('011002')!.name).toBe('Südliche Friedrichstadt');
  });

  it('throws without the header row or a column the map needs', () => {
    expect(() => parseCrimeSheet([['nothing']])).toThrow(/LOR-Schlüssel/);
    expect(() => parseCrimeSheet([HEADER.filter((h) => h !== 'Kieztaten')])).toThrow(/Kieztaten/);
  });
});

describe('buildCrimeAtlas', () => {
  it('puts each Bezirksregion with an outline on the map, with Berlin as the average', () => {
    const built = buildCrimeAtlas(2025, parseCrimeSheet(COUNTS), parseCrimeSheet(RATES), OUTLINES)!;
    expect(built.unmatched).toEqual(['011002']);
    expect(built.data.year).toBe(2025);
    expect(built.data.city).toMatchObject({ total: 12882.1, totalCount: 502743, burglary: 272.1, burglaryCount: 10618 });
    expect(built.data.geojson.features).toHaveLength(1);
    const f = built.data.geojson.features[0]!;
    expect(f.geometry).toBe(square);
    expect(f.properties).toEqual({
      areaId: '011001', name: 'Tiergarten Süd', district: 'Mitte',
      total: 31960.2, totalCount: 5198, assault: 2631.6, assaultCount: 428, robbery: 399.7, robberyCount: 65,
      burglary: 252.1, burglaryCount: 41, bikeTheft: 1887.6, bikeTheftCount: 307, kiez: 8583.4, kiezCount: 1396,
    });
  });

  it('gives null counts for an area missing from the cases sheet', () => {
    const outlines = new Map([...OUTLINES, ['011002', { id: '011002', geometry: square }]]);
    const built = buildCrimeAtlas(2025, parseCrimeSheet(COUNTS), parseCrimeSheet(RATES), outlines)!;
    const area = built.data.geojson.features.find((f) => f.properties.areaId === '011002')!;
    expect(area.properties).toMatchObject({ district: 'Mitte', total: 20818.9, totalCount: null });
  });

  it('is null without the Berlin row', () => {
    expect(buildCrimeAtlas(2025, new Map(), parseCrimeSheet(sheet([])), OUTLINES)).toBeNull();
  });
});
