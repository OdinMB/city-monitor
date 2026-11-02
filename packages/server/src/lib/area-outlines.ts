import { readFile } from 'node:fs/promises';

/**
 * Area outlines that ship with the server, for sources that publish figures
 * per area but no polygons (Köln's Statistischer Datenkatalog) or whose
 * polygons are too heavy to fetch on every run (Hamburg). Each is a GeoJSON
 * FeatureCollection in packages/server/data/, converted once from the city's
 * open data (the conversion is in .context/new-data-sources.md, "Data Freshness
 * Inventory"). Every feature carries the area's `id`; `name`, `district` and
 * `areaKm2` where the source file had them.
 */
export interface AreaOutline {
  id: string;
  name?: string;
  district?: string;
  areaKm2?: number;
  geometry: unknown;
}

interface OutlineFile {
  features?: Array<{ geometry?: unknown; properties?: Record<string, unknown> }>;
}

/** packages/server/data/, from src/lib/ when run with tsx and from dist/lib/ when built. */
const DATA_DIR = new URL('../../data/', import.meta.url);

const loaded = new Map<string, Promise<Map<string, AreaOutline>>>();

/** The outlines in `file` (a name in packages/server/data/), keyed by area ID. Read once per process. */
export function loadAreaOutlines(file: string): Promise<Map<string, AreaOutline>> {
  if (!/^[\w.-]+\.geojson$/.test(file)) throw new Error(`not an outline file name: ${file}`);
  let entry = loaded.get(file);
  if (!entry) {
    entry = readFile(new URL(file, DATA_DIR), 'utf8').then((text) => parseAreaOutlines(JSON.parse(text) as OutlineFile));
    // A failed read is not kept, so the next run tries again.
    entry.catch(() => loaded.delete(file));
    loaded.set(file, entry);
  }
  return entry;
}

export function parseAreaOutlines(json: OutlineFile): Map<string, AreaOutline> {
  const outlines = new Map<string, AreaOutline>();
  for (const f of json.features ?? []) {
    const p = f.properties ?? {};
    if (p.id == null || !f.geometry) continue;
    const id = String(p.id);
    outlines.set(id, {
      id,
      name: typeof p.name === 'string' ? p.name : undefined,
      district: typeof p.district === 'string' ? p.district : undefined,
      areaKm2: typeof p.areaKm2 === 'number' ? p.areaKm2 : undefined,
      geometry: f.geometry,
    });
  }
  return outlines;
}
