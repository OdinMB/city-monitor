import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hamburgStadtteileUrl, parseHamburgStadtteile, parseKoelnPopulation } from './population-parsers.js';

/** Recorded on 2026-11-02 and trimmed (see social-atlas-parsers.test.ts). */
const fixture = (name: string) => readFileSync(new URL(`./social-atlas-fixtures/${name}`, import.meta.url), 'utf8');

describe('parseKoelnPopulation', () => {
  const data = parseKoelnPopulation(fixture('koeln-datenkatalog.csv'));

  it('reads the newest year\'s Quartiere, counted on 31 December', () => {
    expect(data.snapshotDate).toBe('2025-12-31');
    expect(data.areas.map((a) => a.id)).toEqual(['101010001', '101020001', '309050002']);
  });

  it('adds the age bands up to under 18 and 65 and older', () => {
    // Kapitol-Viertel 2025: 0–3 15, 3–6 12, 6–15 29, 15–18 34; 65–75 116, 75–80 68, 80+ 108
    expect(data.areas[0]).toEqual({ id: '101010001', name: 'Kapitol-Viertel', total: 1755, youth: 90, elderly: 292, foreign: 414 });
  });

  it('carries the year before\'s total of the same Quartiere for the change', () => {
    expect(data.previousTotal).toBeGreaterThan(0);
    expect(data.previousTotal).not.toBe(data.areas.reduce((s, a) => s + a.total, 0));
  });

  it('gives nothing for a file without Quartier rows', () => {
    expect(parseKoelnPopulation(fixture('koeln-datenkatalog.csv').split('\n')[0]!)).toEqual({ areas: [], snapshotDate: '' });
  });
});

describe('parseHamburgStadtteile', () => {
  const data = parseHamburgStadtteile(JSON.parse(fixture('hh-stadtteile.json')));

  it('reads the newest year\'s Stadtteile with their area in km²', () => {
    expect(data.snapshotDate).toBe('2025-12-31');
    expect(data.areas).toEqual([
      { id: '101', name: 'Hamburg-Altstadt', total: 2567, youth: 307, elderly: 281, foreign: 618, areaKm2: 1.3 },
      { id: '104', name: 'St. Pauli', total: 22028, youth: 2720, elderly: 2463, foreign: 5010, areaKm2: 2.24 },
    ]);
  });

  it('carries the year before\'s total, not an older one', () => {
    expect(data.previousTotal).toBe(2549 + 22377);
  });

  it('asks for every year without geometry', () => {
    const url = new URL(hamburgStadtteileUrl('https://api.hamburg.de/datasets/v1/x/collections/x/items'));
    expect(url.searchParams.get('skipGeometry')).toBe('true');
    expect(url.searchParams.get('properties')!.split(',')).toContain('bev_auslaender_anz');
  });

  it('gives nothing for an empty response', () => {
    expect(parseHamburgStadtteile({ features: [] })).toEqual({ areas: [], snapshotDate: '' });
    expect(parseHamburgStadtteile(null)).toEqual({ areas: [], snapshotDate: '' });
  });
});
