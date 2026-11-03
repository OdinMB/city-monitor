/**
 * One tree from a city's street-tree register, asked of its WMS when the map
 * is clicked (GetFeatureInfo; the request is built in components/map/constants.ts).
 * Nothing is stored or proxied: the browser asks the city's service directly.
 * See .context/street-trees.md.
 */

import { getStreetTreeInfoRequest, type StreetTreeInfoFormat } from '../components/map/constants.js';

export interface StreetTree {
  /** German name of the species, or of the genus where the register has no species. */
  species: string | null;
  /** Botanical name. */
  botanical: string | null;
  plantedYear: number | null;
  heightM: number | null;
  crownM: number | null;
  girthCm: number | null;
  /** Street, or the park for a Berlin park tree. */
  location: string | null;
  district: string | null;
}

type TextField = 'species' | 'botanical' | 'location' | 'district';
type NumberField = 'plantedYear' | 'heightM' | 'crownM' | 'girthCm';

/** Each register's attribute names for a field, first non-empty one wins. */
const FIELDS: Record<string, Record<TextField | NumberField, readonly string[]>> = {
  // GeoServer GeoJSON, display names as properties (strassenbaeume and anlagenbaeume alike)
  berlin: {
    species: ['Baumart (Deutsch)', 'Gattung (Deutsch)'],
    botanical: ['Baumart (Botanisch)', 'Gattung'],
    plantedYear: ['Pflanzjahr'],
    heightM: ['Baumhöhe in m'],
    crownM: ['Krone Durchmesser in m'],
    girthCm: ['Stamm Umfang in cm'],
    location: ['Straße', 'Objektname'],
    district: ['Bezirk'],
  },
  // deegree GML (de.hh.up:strassenbaum); the register gives no height
  hamburg: {
    species: ['art_deutsch', 'gattung_deutsch'],
    botanical: ['art_latein', 'gattung_latein'],
    plantedYear: ['pflanzjahr'],
    heightM: [],
    crownM: ['kronendurchmesser'],
    girthCm: ['stammumfang'],
    location: ['strasse'],
    district: ['stadtteil'],
  },
  // MapServer/OGR GML (ogr:baumkataster); "-" in a name becomes "_"
  koeln: {
    species: ['Deutscher_Name'],
    botanical: ['Botanischer_Name'],
    plantedYear: ['Pflanzjahr'],
    heightM: ['Höhe___m'],
    crownM: ['Kronendurchmesser___m'],
    girthCm: ['Stammumfang___cm'],
    location: ['Straße'],
    district: ['Stadtteil'],
  },
};

/** The attributes of the first feature in a GetFeatureInfo answer, or null when it has none. */
export function parseFeatureInfo(body: string, format: StreetTreeInfoFormat): Record<string, string> | null {
  if (format === 'application/json') {
    try {
      const json = JSON.parse(body) as { features?: Array<{ properties?: Record<string, unknown> }> };
      const props = json.features?.[0]?.properties;
      if (!props) return null;
      return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v == null ? '' : String(v)]));
    } catch {
      return null;
    }
  }
  const doc = new DOMParser().parseFromString(body, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const member = [...doc.getElementsByTagName('*')].find((el) => el.localName === 'featureMember');
  const feature = member?.firstElementChild;
  if (!feature) return null;
  const record: Record<string, string> = {};
  for (const child of feature.children) {
    if (child.children.length === 0) record[child.localName] = child.textContent?.trim() ?? '';
  }
  return record;
}

function firstText(record: Record<string, string>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key]?.trim();
    if (value) return value;
  }
  return null;
}

/** A positive number ("13.0", "6,5"), or null for an empty, zero or unreadable value. */
function positive(record: Record<string, string>, keys: readonly string[]): number | null {
  const text = firstText(record, keys);
  if (text === null) return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A register's attributes as a tree, or null for a city without a register or a record naming no tree. */
export function toStreetTree(cityId: string, record: Record<string, string>, now = new Date()): StreetTree | null {
  const fields = FIELDS[cityId];
  if (!fields) return null;
  const year = positive(record, fields.plantedYear);
  const tree: StreetTree = {
    species: firstText(record, fields.species),
    botanical: firstText(record, fields.botanical),
    plantedYear: year !== null && Number.isInteger(year) && year >= 1600 && year <= now.getFullYear() ? year : null,
    heightM: positive(record, fields.heightM),
    crownM: positive(record, fields.crownM),
    girthCm: positive(record, fields.girthCm),
    location: firstText(record, fields.location),
    district: firstText(record, fields.district),
  };
  return tree.species || tree.botanical ? tree : null;
}

const EARTH_RADIUS = 6378137;

/**
 * The tree at a point of the map, from the city's register, or null when there
 * is none there (or the city has no register). `zoom` is the map's zoom
 * (512 px tiles). Rejects on a network error or an error status.
 */
export async function fetchStreetTree(
  cityId: string, lng: number, lat: number, zoom: number, signal?: AbortSignal,
): Promise<StreetTree | null> {
  const x = (lng * Math.PI / 180) * EARTH_RADIUS;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * EARTH_RADIUS;
  const metresPerPixel = (2 * Math.PI * EARTH_RADIUS) / (512 * 2 ** zoom);
  const request = getStreetTreeInfoRequest(cityId, x, y, metresPerPixel);
  if (!request) return null;
  const res = await fetch(request.url, { signal });
  if (!res.ok) throw new Error(`Tree register request failed: ${res.status}`);
  const record = parseFeatureInfo(await res.text(), request.format);
  return record ? toStreetTree(cityId, record) : null;
}
