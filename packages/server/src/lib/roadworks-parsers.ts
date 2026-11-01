/**
 * Roadworks feeds, one parser per provider (RoadworksSource in shared/types.ts),
 * each mapping its format to ConstructionSite. The fetching is in
 * cron/ingest-construction.ts; .context/roadworks.md describes the sources.
 */
import type { ConstructionSite } from '@city-monitor/shared';

type Geometry = ConstructionSite['geometry'];

/** Sites starting within this many days are kept, flagged `isFuture`. */
export const ROADWORKS_LOOKAHEAD_DAYS = 14;

/** Longest description kept: Hamburg's texts run to 1,500 characters. */
const MAX_DESCRIPTION = 400;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const berlinDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** The calendar day of `date` in Berlin, as "YYYY-MM-DD". */
function berlinDay(date: Date): string {
  return berlinDayFormat.format(date);
}

/** "31.12.2026", "31-12-2026" or "31.12.2026 23:59" → "2026-12-31"; anything else → null. */
export function parseGermanDay(value: unknown): string | null {
  const m = /^\s*(\d{2})[.-](\d{2})[.-](\d{4})/.exec(String(value ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "2026-12-31" → "31.12.2026", the format the map popup shows. */
function germanDate(day: string): string {
  const [y, mo, d] = day.split('-');
  return `${d}.${mo}.${y}`;
}

/**
 * Whether a site with these days (both inclusive; a null start has begun)
 * belongs on today's map: not over, and starting at most
 * ROADWORKS_LOOKAHEAD_DAYS ahead. null when it does not.
 */
export function activeWindow(start: string | null, end: string, now: Date): { isFuture: boolean } | null {
  const today = berlinDay(now);
  if (end < today) return null;
  if (start && start > berlinDay(new Date(now.getTime() + ROADWORKS_LOOKAHEAD_DAYS * DAY_MS))) return null;
  return { isFuture: start !== null && start > today };
}

function clip(text: string, max = MAX_DESCRIPTION): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * ETRS89 / UTM zone 32N (EPSG:25832) to WGS84 [lon, lat], by the Krüger
 * series (accurate to well under a metre; ETRS89 and WGS84 differ by less
 * than a metre in Germany).
 */
export function utm32ToLonLat(easting: number, northing: number): [number, number] {
  const a = 6378137;
  const f = 1 / 298.257222101; // GRS80
  const k0 = 0.9996;
  const n = f / (2 - f);
  const A = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
  const beta = [n / 2 - (2 * n ** 2) / 3 + (37 * n ** 3) / 96, n ** 2 / 48 + n ** 3 / 15, (17 * n ** 3) / 480];
  const delta = [2 * n - (2 * n ** 2) / 3 - 2 * n ** 3, (7 * n ** 2) / 3 - (8 * n ** 3) / 5, (56 * n ** 3) / 15];

  const xi = northing / (k0 * A);
  const eta = (easting - 500_000) / (k0 * A);
  let xi1 = xi;
  let eta1 = eta;
  for (let j = 1; j <= 3; j++) {
    xi1 -= beta[j - 1]! * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    eta1 -= beta[j - 1]! * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let phi = chi;
  for (let j = 1; j <= 3; j++) phi += delta[j - 1]! * Math.sin(2 * j * chi);
  const lambda = (9 * Math.PI) / 180 + Math.atan2(Math.sinh(eta1), Math.cos(xi1));
  return [round6((lambda * 180) / Math.PI), round6((phi * 180) / Math.PI)];
}

type Ring = number[][];

/** Signed area and area centroid of a ring (shoelace, in degrees: fine at street scale). */
function ringCentroid(ring: Ring): { area: number; lon: number; lat: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[i + 1]!;
    const cross = x0! * y1! - x1! * y0!;
    area += cross;
    cx += (x0! + x1!) * cross;
    cy += (y0! + y1!) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-14) {
    // Degenerate ring: the mean of its vertices
    const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
    return {
      area: 0,
      lon: pts.reduce((s, p) => s + p[0]!, 0) / pts.length,
      lat: pts.reduce((s, p) => s + p[1]!, 0) / pts.length,
    };
  }
  return { area, lon: cx / (6 * area), lat: cy / (6 * area) };
}

/**
 * A point for a Polygon or MultiPolygon: the centroid of the outer ring of its
 * largest part. The map layer draws roadworks as points and lines only.
 */
export function polygonCentroid(geometry: { type: string; coordinates: unknown }): Geometry | null {
  const rings: Ring[] = [];
  if (geometry.type === 'Polygon') {
    const outer = (geometry.coordinates as Ring[] | undefined)?.[0];
    if (outer) rings.push(outer);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of (geometry.coordinates as Ring[][] | undefined) ?? []) {
      if (polygon[0]) rings.push(polygon[0]);
    }
  }
  const parts = rings.filter((r) => r.length > 0).map(ringCentroid);
  if (parts.length === 0) return null;
  const largest = parts.reduce((best, p) => (Math.abs(p.area) > Math.abs(best.area) ? p : best));
  if (!Number.isFinite(largest.lon) || !Number.isFinite(largest.lat)) return null;
  return { type: 'Point', coordinates: [round6(largest.lon), round6(largest.lat)] };
}

interface GeoJsonFeature<P> {
  type?: string;
  id?: string | number;
  geometry?: { type: string; coordinates: unknown } | null;
  properties?: P | null;
}

interface GeoJsonCollection<P> {
  features?: Array<GeoJsonFeature<P>>;
}

// ---------------------------------------------------------------------------
// VIZ Berlin
// ---------------------------------------------------------------------------

/** VIZ German subtype strings → normalized values; null is dropped (accidents). */
const VIZ_SUBTYPES: Record<string, ConstructionSite['subtype'] | null> = {
  Baustelle: 'construction',
  Bauarbeiten: 'construction',
  Sperrung: 'closure',
  Fahrstreifensperrung: 'closure',
  Storung: 'disruption',
  Störung: 'disruption',
  Gefahr: 'disruption',
  Unfall: null,
};

interface VizProps {
  id: string | number;
  subtype: string;
  street?: string | null;
  section?: string | null;
  content?: string | null;
  direction?: string | null;
  is_future?: boolean;
  validity?: { from?: string | null; to?: string | null };
}

/**
 * VIZ Berlin's baustellen_sperrungen.json. VIZ selects what is current itself,
 * so nothing is filtered by date. `warn` hears of subtypes it does not know.
 */
export function parseVizBerlin(data: unknown, warn: (message: string) => void = () => {}): ConstructionSite[] {
  const sites: ConstructionSite[] = [];
  for (const feature of (data as GeoJsonCollection<VizProps> | null)?.features ?? []) {
    const props = feature.properties;
    if (!props || !feature.geometry) continue;
    const mapped = VIZ_SUBTYPES[props.subtype];
    if (mapped === undefined) {
      warn(`unknown VIZ subtype "${props.subtype}"`);
      continue;
    }
    if (!mapped) continue;
    sites.push({
      id: String(props.id),
      subtype: mapped,
      street: props.street || '',
      section: props.section ?? undefined,
      description: props.content || '',
      direction: props.direction ?? undefined,
      validFrom: props.validity?.from ?? undefined,
      validUntil: props.validity?.to ?? undefined,
      isFuture: props.is_future ?? false,
      geometry: feature.geometry as Geometry,
    });
  }
  return sites;
}

// ---------------------------------------------------------------------------
// Hamburg (OGC API Features, Bauweiser)
// ---------------------------------------------------------------------------

interface HamburgProps {
  titel?: string | null;
  organisation?: string | null;
  umfang?: string | null;
  baubeginn?: string | null;
  bauende?: string | null;
}

/**
 * Hamburg's `baustelle` collection: points with a title, the organisation
 * building, the traffic impact (`umfang`) and the construction period. Sites
 * that are over or start more than the lookahead away are dropped.
 */
export function parseHamburgRoadworks(data: unknown, now: Date): ConstructionSite[] {
  const sites: ConstructionSite[] = [];
  for (const feature of (data as GeoJsonCollection<HamburgProps> | null)?.features ?? []) {
    const props = feature.properties;
    if (!props || feature.geometry?.type !== 'Point') continue;
    const start = parseGermanDay(props.baubeginn);
    const end = parseGermanDay(props.bauende);
    if (!end) continue;
    const window = activeWindow(start, end, now);
    if (!window) continue;
    sites.push({
      id: `hh-${feature.id}`,
      subtype: 'construction',
      street: (props.titel ?? '').trim(),
      section: props.organisation?.trim() || undefined,
      description: clip(props.umfang ?? ''),
      validFrom: start ? germanDate(start) : undefined,
      validUntil: germanDate(end),
      isFuture: window.isFuture,
      geometry: feature.geometry as Geometry,
    });
  }
  return sites;
}

// ---------------------------------------------------------------------------
// Köln (MapServer WFS, one layer per kind of works)
// ---------------------------------------------------------------------------

interface KoelnProps {
  Kategorie?: string | null;
  Aktenzeichen?: string | null;
  Adresse?: string | null;
  'Genehmigungs-Zeitraum'?: string | null;
}

/** The GetFeature URL for one layer of Köln's WFS. It ignores srsName: coordinates are EPSG:25832. */
export function koelnLayerUrl(baseUrl: string, layer: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', '2.0.0');
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('typeNames', `ms:${layer}`);
  url.searchParams.set('outputFormat', 'application/json; subtype=geojson');
  return url.toString();
}

/**
 * One layer of Köln's roadworks WFS: points in EPSG:25832 with an address and
 * the permit period ("13-04-2026 bis 13-02-2027"), which the works need not
 * fill. Emergency works (`notfall`) are disruptions. A permit listed twice at
 * one point is kept once.
 */
export function parseKoelnRoadworks(data: unknown, layer: string, now: Date): ConstructionSite[] {
  const sites: ConstructionSite[] = [];
  const seen = new Set<string>();
  for (const feature of (data as GeoJsonCollection<KoelnProps> | null)?.features ?? []) {
    const props = feature.properties;
    if (!props || feature.geometry?.type !== 'Point') continue;
    const [e, n] = feature.geometry.coordinates as number[];
    if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
    const [from, to] = String(props['Genehmigungs-Zeitraum'] ?? '').split(/\s+bis\s+/);
    const start = parseGermanDay(from);
    const end = parseGermanDay(to);
    if (!end) continue;
    const window = activeWindow(start, end, now);
    if (!window) continue;
    const key = `${props.Aktenzeichen}|${e}|${n}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sites.push({
      id: `k-${layer}-${props.Aktenzeichen ?? ''}-${seen.size}`,
      subtype: layer === 'notfall' ? 'disruption' : 'construction',
      street: (props.Adresse ?? '').trim(),
      section: props.Kategorie?.trim() || undefined,
      description: '',
      validFrom: start ? germanDate(start) : undefined,
      validUntil: germanDate(end),
      validity: 'permit',
      isFuture: window.isFuture,
      geometry: { type: 'Point', coordinates: utm32ToLonLat(e!, n!) },
    });
  }
  return sites;
}

// ---------------------------------------------------------------------------
// München (GeoServer WFS, baustellen_opendata)
// ---------------------------------------------------------------------------

/**
 * Server-side filter for München's 5,600 features (5 MB): construction works
 * (not temporary no-parking zones) whose impairment touches the carriageway.
 * Leaves about 900 (under 1 MB). Dates are strings, so they are filtered here.
 */
export const MUENCHEN_CQL_FILTER = "art='Baumaßnahme' AND ("
  + ['fahrbahn', 'fahrspur', 'vollsperr', 'straßensperr', 'sperrung', 'halbseitige sperre']
    .map((word) => `beeintraechtigung ILIKE '%${word}%'`)
    .join(' OR ')
  + ')';

/** München's configured GetFeature URL with MUENCHEN_CQL_FILTER. */
export function muenchenUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('CQL_FILTER', MUENCHEN_CQL_FILTER);
  return url.toString();
}

interface MuenchenProps {
  strasse_hausnr?: string | null;
  beschreibung?: string | null;
  beeintraechtigung?: string | null;
  beginn_datum_kombiniert?: string | null;
  ende_datum_kombiniert?: string | null;
}

/**
 * A full closure: an impairment item that starts "Vollsperr…",
 * "Straßensperrung" or is "Fahrbahn gesperrt". "Zeitweise Vollsperre" and
 * "halbseitige Straßensperrung" are not.
 */
function isFullClosure(impairment: string): boolean {
  return impairment
    .split(/[,/]/)
    .map((part) => part.trim().toLowerCase())
    .some((part) => part.startsWith('vollsperr') || part.startsWith('straßensperrung') || part === 'fahrbahn gesperrt');
}

/**
 * München's baustellen_opendata: polygons, reduced to a point, with the
 * street, a description, the impairment and the period. The start is a date
 * or "Beginn vor mehr als einem Jahr"; the end may carry a time.
 */
export function parseMuenchenRoadworks(data: unknown, now: Date): ConstructionSite[] {
  const sites: ConstructionSite[] = [];
  for (const feature of (data as GeoJsonCollection<MuenchenProps> | null)?.features ?? []) {
    const props = feature.properties;
    if (!props || !feature.geometry) continue;
    const end = parseGermanDay(props.ende_datum_kombiniert);
    if (!end) continue;
    const start = parseGermanDay(props.beginn_datum_kombiniert);
    const window = activeWindow(start, end, now);
    if (!window) continue;
    const point = polygonCentroid(feature.geometry);
    if (!point) continue;
    const impairment = (props.beeintraechtigung ?? '').trim();
    sites.push({
      id: `m-${String(feature.id ?? '').replace(/^baustellen_opendata\./, '')}`,
      subtype: isFullClosure(impairment) ? 'closure' : 'construction',
      street: (props.strasse_hausnr ?? '').trim(),
      section: props.beschreibung?.trim() || undefined,
      description: clip(impairment.replace(/,(?=\S)/g, ', ')),
      validFrom: start ? germanDate(start) : undefined,
      validUntil: germanDate(end),
      isFuture: window.isFuture,
      geometry: point,
    });
  }
  return sites;
}
