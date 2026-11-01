/**
 * One label point per district. A symbol layer on the district polygons
 * labels each polygon once per map tile it crosses, so a large district
 * (Bergedorf, Spandau) showed its name twice; a point source labels it once.
 */

type Ring = number[][];

/** Signed area of a ring (shoelace), in squared degrees. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!);
  }
  return sum / 2;
}

/**
 * A point inside a polygon (outer ring first, then holes): the middle of the
 * widest stretch inside it along the line of latitude through the middle of
 * its height. Unlike the centroid, it never falls outside a concave district
 * or into a hole.
 */
function pointInside(rings: Ring[]): [number, number] {
  const ys = rings[0]!.map((p) => p[1]!);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs: number[] = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j]!;
      const [x2, y2] = ring[i]!;
      if ((y1! > y) !== (y2! > y)) xs.push(x1! + ((y - y1!) * (x2! - x1!)) / (y2! - y1!));
    }
  }
  xs.sort((a, b) => a - b);
  let best: [number, number] = [rings[0]![0]![0]!, rings[0]![0]![1]!];
  let widest = -1;
  // Between each pair of crossings the line is inside (even-odd).
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const width = xs[i + 1]! - xs[i]!;
    if (width > widest) {
      widest = width;
      best = [(xs[i]! + xs[i + 1]!) / 2, y];
    }
  }
  return best;
}

/** Where a district's label goes: inside its largest part. */
export function labelPoint(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number] {
  const parts: Ring[][] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const largest = parts.reduce((a, b) => (Math.abs(ringArea(b[0]!)) > Math.abs(ringArea(a[0]!)) ? b : a));
  return pointInside(largest);
}

/** One point per district outline, carrying its name under `nameField`. */
export function districtLabelPoints(geojson: GeoJSON.FeatureCollection, nameField: string): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const feature of geojson.features) {
    const { geometry } = feature;
    if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') continue;
    features.push({
      type: 'Feature',
      properties: { [nameField]: feature.properties?.[nameField] },
      geometry: { type: 'Point', coordinates: labelPoint(geometry) },
    });
  }
  return { type: 'FeatureCollection', features };
}
