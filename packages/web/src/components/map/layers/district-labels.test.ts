import { describe, it, expect } from 'vitest';
import { districtLabelPoints, labelPoint } from './district-labels.js';

/** Even-odd test against every ring, holes included. */
function inside([x, y]: number[], rings: number[][][]): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if ((yi! > y!) !== (yj! > y!) && x! < ((xj! - xi!) * (y! - yi!)) / (yj! - yi!) + xi!) hit = !hit;
    }
  }
  return hit;
}

const square = (x: number, y: number, size: number) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];

describe('labelPoint', () => {
  it('puts the label inside a C-shaped district, whose centre lies outside it', () => {
    // A "C" open to the east: its bounding-box centre (5, 5) is in the opening.
    const c = [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10], [0, 0]]];
    expect(inside(labelPoint({ type: 'Polygon', coordinates: c }), c)).toBe(true);
  });

  it('keeps the label out of a hole', () => {
    const withHole = [square(0, 0, 10), square(3, 3, 4)];
    expect(inside(labelPoint({ type: 'Polygon', coordinates: withHole }), withHole)).toBe(true);
  });

  it('puts the label on the largest part of a district in several parts', () => {
    const small = [square(100, 100, 1)];
    const large = [square(0, 0, 10)];
    const point = labelPoint({ type: 'MultiPolygon', coordinates: [small, large] });
    expect(inside(point, large)).toBe(true);
  });
});

describe('districtLabelPoints', () => {
  it('gives each district one point, named as its outline is', () => {
    const points = districtLabelPoints({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { bezirk_name: 'Bergedorf' }, geometry: { type: 'Polygon', coordinates: [square(0, 0, 10)] } },
        { type: 'Feature', properties: { bezirk_name: 'Harburg' }, geometry: { type: 'MultiPolygon', coordinates: [[square(20, 0, 5)], [square(40, 0, 1)]] } },
        { type: 'Feature', properties: { bezirk_name: 'No outline' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    }, 'bezirk_name');

    expect(points.features.map((f) => f.properties?.bezirk_name)).toEqual(['Bergedorf', 'Harburg']);
    expect(points.features.every((f) => f.geometry.type === 'Point')).toBe(true);
  });
});
