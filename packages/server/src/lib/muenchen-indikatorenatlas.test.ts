import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ckanPackageUrl, csvResourceUrl, districtRows, fetchIndikatorCsv, parseIndikatorCsv } from './muenchen-indikatorenatlas.js';

/** Recorded on 2026-11-02 and trimmed (see social-atlas-parsers.test.ts). */
const fixture = (name: string) => readFileSync(new URL(`./social-atlas-fixtures/${name}`, import.meta.url), 'utf8');

describe('parseIndikatorCsv', () => {
  const rows = parseIndikatorCsv(fixture('muc-altersgruppen.csv'));

  it('numbers each Stadtbezirk and leaves the city total without one', () => {
    const city = rows.find((r) => r.districtId === null)!;
    expect(city).toMatchObject({ name: 'Stadt München', breakdown: 'bis 17 Jahre', year: 2025, value: 15.2, base1: 245160, base2: 1612429 });
    expect(rows.find((r) => r.districtId === '11')!.name).toBe('Milbertshofen-Am Hart');
  });

  it('reads an unquoted NA as an empty cell', () => {
    const total = districtRows(rows, 'insgesamt', 2025).find((r) => r.districtId === '01')!;
    expect(total).toMatchObject({ value: 20606, base1: 20606, base2: null });
  });

  it('filters the Stadtbezirke by breakdown and year', () => {
    expect(districtRows(rows, '65 Jahre und älter', 2024).map((r) => r.districtId)).toEqual(['01', '11', '19']);
    expect(districtRows(rows, '65 Jahre und älter')).toHaveLength(6);
  });

  it('keeps a quoted comma inside its cell', () => {
    const csv = '"Ausprägung","Jahr","Raumbezug","Indikatorwert","Basiswert 1","Basiswert 2"\n"a, b","2024","01 Altstadt - Lehel","1.5","3",NA';
    expect(parseIndikatorCsv(csv)[0]).toMatchObject({ breakdown: 'a, b', value: 1.5, base1: 3, base2: null });
  });
});

describe('CKAN lookup', () => {
  const pkg = JSON.parse(fixture('muc-package-show.json'));

  it('asks package_show for the dataset', () => {
    expect(ckanPackageUrl('https://opendata.muenchen.de/api/3/action/', 'x-y')).toBe('https://opendata.muenchen.de/api/3/action/package_show?id=x-y');
  });

  it('takes the CSV resource, whatever its release date', () => {
    expect(csvResourceUrl(pkg)).toMatch(/\/download\/indikat_\d{4}arbeitsmarkt_arbeitslose_-_anteil_\d{2}_\d{2}_\d{2}\.csv$/);
    expect(csvResourceUrl({ result: { resources: [{ format: 'PDF', url: 'x' }] } })).toBeNull();
    expect(csvResourceUrl(null)).toBeNull();
  });

  it('fetches the package, then its CSV', async () => {
    const get = vi.fn(async (url: string) => (url.includes('package_show')
      ? new Response(JSON.stringify(pkg))
      : new Response('"Ausprägung"')));
    await expect(fetchIndikatorCsv('https://opendata.muenchen.de/api/3/action', 'd', get)).resolves.toBe('"Ausprägung"');
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1]![0]).toBe(csvResourceUrl(pkg));
  });

  it('gives null when a request fails, and throws when the dataset has no CSV', async () => {
    await expect(fetchIndikatorCsv('x', 'd', async () => null)).resolves.toBeNull();
    const noCsv = async () => new Response(JSON.stringify({ result: { resources: [] } }));
    await expect(fetchIndikatorCsv('x', 'd', noCsv)).rejects.toThrow(/lists no CSV/);
  });
});
