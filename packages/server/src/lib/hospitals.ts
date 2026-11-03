/**
 * Parsers for the emergencies layer's hospitals (.context/hospitals.md): the
 * Bundes-Klinik-Atlas open-data export (G-BA; XML inside a ZIP, every German
 * hospital site with its G-BA emergency tier) and Hamburg's hospital WFS
 * (GeoJSON, ER participation without a tier).
 */
import { XMLParser } from 'fast-xml-parser';
import type { Hospital, HospitalTier } from '@city-monitor/shared';

/** The Klinik-Atlas open-data page, which links the current export. */
export const KLINIK_ATLAS_PAGE = 'https://bundes-klinik-atlas.de/open-data/';

/** Comprehensive first, as the map draws and the API lists them. */
export const TIER_ORDER: readonly HospitalTier[] = ['comprehensive', 'extended', 'basic', 'emergency', 'limited', 'specialised', 'none'];

/**
 * The newest export the page links (`/fileadmin/dataextracts/Bundes-Klinik-Atlas_Datenexport_20261027.zip`),
 * as an absolute URL with its date (YYYY-MM-DD); null when it links none. The
 * file name carries the date, so it changes with every export.
 */
export function findKlinikAtlasExport(html: string, page = KLINIK_ATLAS_PAGE): { url: string; date: string } | null {
  let best: { url: string; date: string } | null = null;
  for (const m of html.matchAll(/href="([^"]*Bundes-Klinik-Atlas_Datenexport_(\d{4})(\d{2})(\d{2})\.zip)"/g)) {
    const date = `${m[2]}-${m[3]}-${m[4]}`;
    if (!best || date > best.date) best = { url: new URL(m[1]!, page).toString(), date };
  }
  return best;
}

const flag = (v: unknown): boolean => v === '1' || v === 'true' || v === 1 || v === true;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** A website as a link: "www.x.de" gets a scheme, anything that is not http(s) is dropped. */
function website(raw: string): string | null {
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : /^www\./i.test(raw) ? `https://${raw}` : null;
  if (!withScheme) return null;
  try {
    const url = new URL(withScheme);
    // The export has e-mail addresses in the URL field ("http://klinikhamburg@schoen-klinik.de")
    return url.username || url.password ? null : url.toString();
  } catch {
    return null;
  }
}

/** The G-BA tier from `<StandortNotfallversorgung>`; Stufe 9 (undocumented, 14 sites nationwide) counts as none. */
export function klinikAtlasTier(n: Record<string, unknown> | undefined): HospitalTier {
  switch (str(n?.Stufe)) {
    case '3': return 'comprehensive';
    case '2': return 'extended';
    case '1': return 'basic';
    default: return flag(n?.Spezialversorgung) || Number(str(n?.Kinder)) > 0 ? 'specialised' : 'none';
  }
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  // Only the three elements read here; the export's long lists (diagnoses, departments, indicators) are skipped
  isArray: (name) => name === 'Standort',
});

/**
 * The sites of the Klinik-Atlas export (`<Standorte><Standort>…`) whose `Ort`
 * is one of `places`, with WGS84 coordinates. Null when the XML is not the export.
 */
export function parseKlinikAtlas(text: string, places: readonly string[]): Hospital[] | null {
  const doc = xml.parse(text) as { Standorte?: { Standort?: Array<Record<string, Record<string, unknown> | undefined>> } };
  const sites = doc.Standorte?.Standort;
  if (!Array.isArray(sites)) return null;
  const wanted = new Set(places);
  const hospitals: Hospital[] = [];
  for (const site of sites) {
    const k = site.StandortKontaktDaten;
    if (!k || !wanted.has(str(k.Ort))) continue;
    const lat = Number(str(k.Breitengrad));
    const lon = Number(str(k.Laengengrad));
    const id = str(k.STOID);
    const name = str(k.Name);
    if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lon) || str(k.Breitengrad) === '') continue;
    const n = site.StandortNotfallversorgung;
    const beds = Number(str(site.StandortStrukturDaten?.AnzahlBetten));
    const street = str(k.Strasse);
    const town = [str(k.PLZ), str(k.Ort)].filter(Boolean).join(' ');
    hospitals.push({
      id: `kla-${id}`,
      name,
      address: [street, town].filter(Boolean).join(', ') || null,
      lat,
      lon,
      tier: klinikAtlasTier(n),
      children: Number(str(n?.Kinder)) > 0,
      strokeUnit: flag(n?.StrokeUnit),
      chestPainUnit: flag(n?.ChestPainUnit),
      trauma: flag(n?.Schwerverletztenversorgung),
      beds: str(site.StandortStrukturDaten?.AnzahlBetten) !== '' && Number.isFinite(beds) ? beds : null,
      url: website(str(k.URL)),
      source: 'klinik-atlas',
    });
  }
  return hospitals;
}

/** `not_und_unfallversorgung`: "Teilnahme …", "eingeschränkte Teilnahme …", "keine Teilnahme …". */
export function hamburgTier(text: string): HospitalTier {
  if (/^keine/i.test(text)) return 'none';
  if (/^eingeschränkt/i.test(text)) return 'limited';
  if (/^Teilnahme/i.test(text)) return 'emergency';
  return 'none';
}

/**
 * Hamburg's WFS answer (GeoJSON, asked for in EPSG:4326) as hospitals; null
 * when it is not a FeatureCollection.
 */
export function parseHamburgHospitals(json: unknown): Hospital[] | null {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;
  const hospitals: Hospital[] = [];
  for (const f of features as Array<{ geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }>) {
    const p = f.properties ?? {};
    const [lon, lat] = Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates as unknown[] : [];
    const id = str(p.id);
    const name = str(p.name);
    if (!id || !name || typeof lat !== 'number' || typeof lon !== 'number') continue;
    const beds = typeof p.planbetten === 'number' ? p.planbetten : null;
    hospitals.push({
      id: `hh-${id}`,
      name,
      address: [str(p.adresse), str(p.ort)].filter(Boolean).join(', ') || null,
      lat,
      lon,
      tier: hamburgTier(str(p.not_und_unfallversorgung)),
      children: false,
      strokeUnit: false,
      chestPainUnit: false,
      trauma: false,
      beds,
      url: website(str(p.homepage)),
      source: 'hamburg-wfs',
    });
  }
  return hospitals;
}

/** Metres between two points (equirectangular: exact enough at city scale). */
function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * 111_320;
}

/** Two records this close are taken to be the same hospital (one site, two sources). */
export const SAME_SITE_METRES = 250;

/**
 * The hospitals of all sources as one list: a Klinik-Atlas site (which has the
 * G-BA tier) wins over a record of another source within SAME_SITE_METRES.
 * By tier, comprehensive first, then name.
 */
export function mergeHospitals(lists: ReadonlyArray<readonly Hospital[]>): Hospital[] {
  const all = lists.flat();
  const atlas = all.filter((h) => h.source === 'klinik-atlas');
  const others = all.filter((h) => h.source !== 'klinik-atlas' && !atlas.some((a) => metres(a, h) < SAME_SITE_METRES));
  return [...atlas, ...others].sort((a, b) =>
    TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.name.localeCompare(b.name, 'de'));
}
