import { describe, it, expect } from 'vitest';
import type { CityConfig } from '@city-monitor/shared';
import { loadAreaOutlines, parseAreaOutlines } from './area-outlines.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';
import { koeln } from '../config/cities/koeln.js';
import { muenchen } from '../config/cities/muenchen.js';

/** Every outline file a city config names, with the city whose box its polygons must lie in. */
const FILES: Array<[string, CityConfig, number]> = [
  ['koeln-quartiere.geojson', koeln, 570],
  ['hamburg-statistische-gebiete.geojson', hamburg, 857],
  ['hamburg-stadtteile.geojson', hamburg, 99],
  ['muenchen-stadtbezirke.geojson', muenchen, 25],
  ['berlin-agh2026-wahlkreise.geojson', berlin, 78],
];

function* positions(coords: unknown): Generator<[number, number]> {
  if (Array.isArray(coords) && typeof coords[0] === 'number') {
    yield [coords[0] as number, coords[1] as number];
    return;
  }
  if (Array.isArray(coords)) for (const c of coords) yield* positions(c);
}

describe('shipped area outlines', () => {
  it.each(FILES)('%s holds one polygon per area, inside the city', async (file, city, count) => {
    const outlines = await loadAreaOutlines(file);
    expect(outlines.size).toBe(count);
    // Neuwerk, Hamburg's island in the North Sea, lies outside the city's map box: allow a margin.
    const box = city.boundingBox;
    for (const outline of outlines.values()) {
      const geom = outline.geometry as { type: string; coordinates: unknown };
      expect(['Polygon', 'MultiPolygon'], outline.id).toContain(geom.type);
      for (const [lon, lat] of positions(geom.coordinates)) {
        expect(lat > box.south - 0.3 && lat < box.north + 0.3 && lon > box.west - 1.8 && lon < box.east + 0.3, `${file} ${outline.id}`).toBe(true);
      }
    }
  });

  it('names the outline files the city configs use', () => {
    const named = [berlin, koeln, hamburg, muenchen]
      .flatMap((c) => [c.dataSources.socialAtlas, c.dataSources.population, c.dataSources.electionResults])
      .flatMap((s) => (s && 'outlines' in s ? [s.outlines] : []));
    expect(new Set(named)).toEqual(new Set(FILES.map(([f]) => f)));
  });

  it('numbers Berlin\'s Abgeordnetenhaus Wahlkreise by Bezirk and Wahlkreis, as the results do', async () => {
    const ids = [...(await loadAreaOutlines('berlin-agh2026-wahlkreise.geojson')).keys()];
    expect(ids[0]).toBe('0101');
    expect(ids.every((id) => /^(0[1-9]|1[0-2])\d\d$/.test(id))).toBe(true);
    // Every Bezirk has at least five
    const perBezirk = new Map<string, number>();
    for (const id of ids) perBezirk.set(id.slice(0, 2), (perBezirk.get(id.slice(0, 2)) ?? 0) + 1);
    expect(perBezirk.size).toBe(12);
    expect(Math.min(...perBezirk.values())).toBeGreaterThanOrEqual(5);
  });

  it('gives Köln\'s Quartiere their Stadtbezirk and area', async () => {
    const kapitol = (await loadAreaOutlines('koeln-quartiere.geojson')).get('101010001')!;
    expect(kapitol).toMatchObject({ name: 'Kapitol-Viertel', district: 'Innenstadt' });
    expect(kapitol.areaKm2).toBeCloseTo(0.13, 2);
  });

  it('numbers München\'s Stadtbezirke as the Indikatorenatlas does, with the GeodatenService\'s areas', async () => {
    const outlines = await loadAreaOutlines('muenchen-stadtbezirke.geojson');
    expect([...outlines.keys()]).toEqual(Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(2, '0')));
    expect(outlines.get('01')).toMatchObject({ name: 'Altstadt-Lehel', areaKm2: 3.146 });
    // The Indikatorenatlas gives the city 310.7 km²
    const total = [...outlines.values()].reduce((s, o) => s + o.areaKm2!, 0);
    expect(total).toBeCloseTo(310.7, 0);
  });

  it('refuses a path instead of a file name', () => {
    expect(() => loadAreaOutlines('../package.json')).toThrow(/not an outline file/);
  });

  it('skips features without an ID or geometry', () => {
    const outlines = parseAreaOutlines({
      features: [
        { geometry: { type: 'Polygon', coordinates: [] }, properties: { id: 7, name: 'A' } },
        { geometry: { type: 'Polygon', coordinates: [] }, properties: {} },
        { properties: { id: '8' } },
      ],
    });
    expect([...outlines.keys()]).toEqual(['7']);
  });
});
