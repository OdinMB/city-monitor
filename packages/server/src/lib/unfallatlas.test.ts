import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { agsPrefix, newestUnfallatlasCsv, parseUnfallatlasCsv, streamLines } from './unfallatlas.js';
import { listZipEntries, openZipEntry } from './zip.js';

const fixture = (name: string) => readFileSync(new URL(`./unfallatlas-fixtures/${name}`, import.meta.url));
// Real rows of the 2025 file (Schleswig-Holstein, Köln, Rhein-Erft, Landkreis and Stadt München,
// Berlin) plus one Hamburg row with month 13
const CSV = fixture('csv/Unfallorte_2025_LR_BasisDLM.csv');
const ZIP = fixture('Unfallorte2025_sample.zip');

const CITIES = [
  { cityId: 'berlin', prefix: agsPrefix('11000000') },
  { cityId: 'hamburg', prefix: agsPrefix('02000000') },
  { cityId: 'koeln', prefix: agsPrefix('05315000') },
  { cityId: 'muenchen', prefix: agsPrefix('09162000') },
];

async function* linesOf(text: string) {
  for (const line of text.split('\n')) yield line;
}

describe('newestUnfallatlasCsv', () => {
  it('picks the newest year\'s CSV archive, not its shapefile', () => {
    const index = {
      metafiles: [{ name: 'DSB_Unfallatlas.pdf' }],
      datasets: [
        { name: 'Unfallorte2025', files: [
          { name: 'Unfallorte2025_EPSG25832_CSV.zip', timestamp: '2026-07-07T07:47:16.637175' },
          { name: 'Unfallorte2025_EPSG25832_Shape.zip', timestamp: '2026-07-07T07:47:16.638175' },
        ] },
        { name: 'Unfallorte2024', files: [{ name: 'Unfallorte2024_EPSG25832_CSV.zip', timestamp: '2025-07-09T07:37:08' }] },
      ],
    };
    expect(newestUnfallatlasCsv(index)).toEqual({
      year: 2025,
      url: 'https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/Unfallorte2025_EPSG25832_CSV.zip',
      published: '2026-07-07T07:47:16',
    });
  });

  it('returns null for an index without CSV archives', () => {
    expect(newestUnfallatlasCsv({ datasets: [{ files: [{ name: 'Unfallorte2025_EPSG25832_Shape.zip' }] }] })).toBeNull();
    expect(newestUnfallatlasCsv('<html>')).toBeNull();
  });
});

describe('agsPrefix', () => {
  it('matches a city-state by its Land, a kreisfreie Stadt by its Kreis, a town by its whole key', () => {
    expect(agsPrefix('11000000')).toBe('11');
    expect(agsPrefix('02000000')).toBe('02');
    expect(agsPrefix('05315000')).toBe('05315');
    expect(agsPrefix('09184130')).toBe('09184130');
    expect(() => agsPrefix('5315000')).toThrow();
  });
});

describe('streamLines', () => {
  it('splits lines across chunks, drops the BOM and CRs, and keeps multi-byte characters whole', async () => {
    const bytes = Buffer.from('﻿a;b\r\nMünchen;1\r\nlast', 'utf8');
    // Cut inside "ü" (2 bytes) and between \r and \n
    const chunks = [bytes.subarray(0, 8), bytes.subarray(8, 12), bytes.subarray(12)];
    const out: string[] = [];
    for await (const line of streamLines(Readable.from(chunks))) out.push(line);
    expect(out).toEqual(['a;b', 'München;1', 'last']);
  });
});

describe('parseUnfallatlasCsv', () => {
  it('keeps each city\'s accidents by municipality key, with severity, time, kind, type and participants', async () => {
    const { byCity, skipped } = await parseUnfallatlasCsv(streamLines(Readable.from([CSV])), CITIES);

    // Köln 05-3-15 only: Rhein-Erft (05-3-16) and the Landkreis München (09-1-84) are left out
    expect(byCity.get('koeln')).toEqual([
      // Pedestrian hit by a motorcycle: slightly injured, January, Saturday 11–12 h
      [6.92254, 50.91329, 3, 1, 7, 11, 6, 4, 4 | 8],
      // Killed: May, Saturday 0–1 h, car and motorcycle
      [7.0558, 50.92828, 1, 5, 7, 0, 1, 6, 2 | 8],
    ]);
    expect(byCity.get('muenchen')).toEqual([[11.58424, 48.19581, 3, 1, 3, 19, 5, 3, 2]]);
    // Berlin's Bezirk 02 (Friedrichshain-Kreuzberg) belongs to the Land's key 11; a bicycle
    expect(byCity.get('berlin')).toEqual([[13.4512, 52.5099, 3, 4, 7, 14, 5, 3, 1]]);
    // The Hamburg row has month 13
    expect(byCity.get('hamburg')).toEqual([]);
    expect(skipped).toBe(1);
  });

  it('refuses a file without a column the layer needs, rather than storing nothing', async () => {
    await expect(parseUnfallatlasCsv(linesOf('ULAND;UREGBEZ;UKREIS\n11;0;01'), CITIES)).rejects.toThrow(/lacks UGEMEINDE/);
    await expect(parseUnfallatlasCsv(linesOf(''), CITIES)).rejects.toThrow(/empty/);
  });
});

describe('zip', () => {
  it('lists the archive\'s members and streams the deflated CSV out of it', async () => {
    const entries = listZipEntries(ZIP);
    expect(entries.map((e) => e.name)).toEqual(['csv/', 'csv/Unfallorte_2025_LR_BasisDLM.csv']);
    const csv = entries[1];
    expect(csv.method).toBe(8);
    const chunks: Buffer[] = [];
    for await (const chunk of openZipEntry(ZIP, csv)) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).equals(CSV)).toBe(true);
  });

  it('throws for something that is not a ZIP', () => {
    expect(() => listZipEntries(Buffer.from('<html>not found</html>'))).toThrow(/not a ZIP/);
  });
});
