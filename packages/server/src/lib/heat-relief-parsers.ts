/**
 * Parsers for the heat-relief layer's lists, one per `HeatReliefSource`
 * provider (.context/heat-relief.md): cool places, drinking fountains and
 * public toilets. Each takes the parsed response and returns the places it can
 * read, leaving out entries without a position; text stays in the source's
 * German, trimmed, and fields the source lacks are left out.
 */
import { XMLParser } from 'fast-xml-parser';
import type { HeatReliefPlace, HeatReliefSource, KoelnCoolLayer } from '@city-monitor/shared';
import { utm32ToLonLat } from './roadworks-parsers.js';

/** Longest note kept; Köln's cool-place descriptions run to several hundred characters. */
const MAX_NOTE = 240;

type Props = Record<string, unknown>;
type Feature = { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Props | null };

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/** A trimmed string, or undefined for anything empty or not a string. Line breaks become "; ". */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // A line may already end in ";" ("Mo: 12:00 - 20:00 Uhr; ⏎ Mi - Fr: …")
  const t = value.replace(/<br\s*\/?>/gi, '\n').split(/\s*\n\s*/).map((s) => s.trim().replace(/;$/, '').trim()).filter(Boolean).join('; ');
  return t === '' ? undefined : t;
}

function clip(value: string | undefined, max = MAX_NOTE): string | undefined {
  if (value === undefined || value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A GeoJSON FeatureCollection's features, or null when the answer is not one. */
function featuresOf(json: unknown): Feature[] | null {
  if (typeof json !== 'object' || json === null) return null;
  const features = (json as { features?: unknown }).features;
  return Array.isArray(features) ? (features as Feature[]) : null;
}

/** A point feature's [lon, lat] in WGS84, or null. */
function lonLat(f: Feature): [number, number] | null {
  const g = f.geometry;
  if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) return null;
  const [lon, lat] = g.coordinates as unknown[];
  return typeof lon === 'number' && typeof lat === 'number' && Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

/** "50.884379,7.056914" (lat,lon, as Köln and AWB write it) to [lon, lat], or null. */
function latCommaLon(value: unknown): [number, number] | null {
  if (typeof value !== 'string') return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  return m ? [Number(m[2]), Number(m[1])] : null;
}

/** Drops undefined fields, so the stored JSON carries only what the source has. */
function place(p: HeatReliefPlace): HeatReliefPlace {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as unknown as HeatReliefPlace;
}

function at(kind: HeatReliefPlace['kind'], [lon, lat]: [number, number], rest: Omit<HeatReliefPlace, 'kind' | 'lat' | 'lon'>): HeatReliefPlace {
  return place({ kind, lat: round5(lat), lon: round5(lon), ...rest });
}

/** "ja"/"nein" (Berlin's toilet list) to a boolean, anything else to undefined. */
function jaNein(value: unknown): boolean | undefined {
  if (value === 'ja') return true;
  if (value === 'nein') return false;
  return undefined;
}

const GERMAN_MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];

/** "Betriebszeit: Mai bis Oktober, …" to { from: 5, to: 10 }, or undefined. */
export function parseSeason(value: unknown): { from: number; to: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const m = /([A-Za-zäÄ]+)\s+bis\s+([A-Za-zäÄ]+)/.exec(value);
  if (!m) return undefined;
  const from = GERMAN_MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
  const to = GERMAN_MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
  return from > 0 && to > 0 ? { from, to } : undefined;
}

// --- Request URLs ---

function wfs2(url: string, typeName: string, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: typeName,
    outputFormat: 'application/json', srsName: 'EPSG:4326', ...extra,
  });
  return `${url}?${q}`;
}

/**
 * Köln's geoportal answers GeoJSON only to WFS 1.1.0 with `outputFormat=geojson`
 * (WFS 2.0 with application/json is an exception) and ignores `srsName`. The
 * cool places carry base64 photos, so `propertyName` asks for the text alone.
 */
function koelnWfs(url: string, typeName: string, propertyName?: string): string {
  const q = new URLSearchParams({ service: 'WFS', version: '1.1.0', request: 'GetFeature', typeName, outputFormat: 'geojson' });
  if (propertyName) q.set('propertyName', propertyName);
  return `${url}?${q}`;
}

export const KOELN_COOL_PROPERTIES = 'Beschreibung_des_kühlen_Ortes,Koordinate_WGS84';
/** München's toilet list has ~90 columns of accessibility detail; these are the ones shown. */
export const MUENCHEN_TOILET_PROPERTIES = 'shape,name,strasse,hausnr,oeffnungszeiten,kategorie,preis,wickeln,zustand,einschraenkungen';

/** The requests one source needs, each with the label its parser takes (Köln's cool-places layer). */
export function heatReliefRequests(source: HeatReliefSource): Array<{ url: string; layer?: KoelnCoolLayer }> {
  switch (source.provider) {
    case 'berlin-cool-rooms': return [{ url: wfs2(source.url, 'kuehle_raeume:kuehle_raeume') }];
    case 'berlin-fountains': return [{ url: wfs2(source.url, 'trinkwasserbrunnen:trinkwasserbrunnen') }];
    case 'berlin-toilets': return [{ url: wfs2(source.url, 'toiletten:toiletten') }];
    case 'hamburg-fountains': return [{ url: wfs2(source.url, 'de.hh.up:trinkwasserbrunnen', { outputFormat: 'application/geo+json' }) }];
    case 'koeln-cool-places': return source.layers.map((layer) => ({ url: koelnWfs(source.url, `ms:${layer}`, KOELN_COOL_PROPERTIES), layer }));
    case 'koeln-fountains': return [{ url: koelnWfs(source.url, 'ms:trinkwasserbrunnen') }];
    case 'koeln-toilets': return [{ url: source.url }];
    case 'muenchen-fountains': return [{ url: wfs2(source.url, 'baug_wfs:trinkwasserbrunnen') }];
    case 'muenchen-toilets': return [{ url: wfs2(source.url, 'gsm_wfs:wc_finder_opendata', { propertyName: MUENCHEN_TOILET_PROPERTIES }) }];
  }
}

// --- Berlin (GDI Berlin WFS, dl-de/zero-2.0) ---

const ACCESS: Record<string, HeatReliefPlace['accessible']> = {
  'rollstuhlgerecht': 'yes',
  'eingeschränkt rollstuhlgerecht': 'partly',
  'nicht rollstuhlgerecht': 'no',
};

/** Berlin's cool rooms (kuehle_raeume): name, address, hours, wheelchair access and a note. */
export function parseBerlinCoolRooms(json: unknown): HeatReliefPlace[] | null {
  const features = featuresOf(json);
  if (!features) return null;
  return features.flatMap((f) => {
    const pos = lonLat(f);
    const p = f.properties ?? {};
    if (!pos) return [];
    const access = typeof p.rollstuhlgerechter_zugang === 'string' ? ACCESS[p.rollstuhlgerechter_zugang.trim().toLowerCase()] : undefined;
    return [at('cool', pos, {
      name: text(p.kuehle_raeume) ?? '',
      address: text(p.adresse),
      hours: text(p.oeffnungszeiten),
      note: clip(text(p.hinweis)),
      accessible: access,
    })];
  });
}

/** Berlin's drinking fountains (Berliner Wasserbetriebe): location, season (May–October) and restrictions. */
export function parseBerlinFountains(json: unknown): HeatReliefPlace[] | null {
  const features = featuresOf(json);
  if (!features) return null;
  return features.flatMap((f) => {
    const pos = lonLat(f);
    const p = f.properties ?? {};
    if (!pos) return [];
    const restriction = text(p.einschraenkungen);
    return [at('fountain', pos, {
      name: text(p.standort) ?? '',
      note: clip(restriction),
      season: parseSeason(p.informationen),
      outOfOrder: restriction !== undefined && /außer Betrieb/i.test(restriction) ? true : undefined,
    })];
  });
}

/** Berlin's public toilets: location, hours, fee, accessibility (barrierefrei, else barrierearm) and changing table. */
export function parseBerlinToilets(json: unknown): HeatReliefPlace[] | null {
  const features = featuresOf(json);
  if (!features) return null;
  return features.flatMap((f) => {
    const pos = lonLat(f);
    const p = f.properties ?? {};
    if (!pos) return [];
    const free = jaNein(p.barrierefrei);
    const low = jaNein(p.barrierearm);
    const accessible = free ? 'yes' : low ? 'partly' : free === false ? 'no' : undefined;
    return [at('toilet', pos, {
      name: text(p.standort) ?? '',
      hours: text(p.oeffnungszeiten),
      fee: finite(p.nutzungsentgelt),
      accessible,
      changingTable: jaNein(p.wickeltisch),
    })];
  });
}

// --- Hamburg (Geodienste WFS, dl-de/by-2.0) ---

/** Hamburg's drinking fountains (BUKEA): the address alone. */
export function parseHamburgFountains(json: unknown): HeatReliefPlace[] | null {
  const features = featuresOf(json);
  if (!features) return null;
  return features.flatMap((f) => {
    const pos = lonLat(f);
    if (!pos) return [];
    return [at('fountain', pos, { name: text(f.properties?.adresse) ?? '' })];
  });
}

// --- Köln (Stadt Köln geoportal, AWB; dl-de/zero-2.0) ---

const KOELN_SETTING: Record<KoelnCoolLayer, NonNullable<HeatReliefPlace['setting']>> = {
  im_innenraum: 'indoor',
  klimatisierter_ort: 'air-conditioned',
  am_wasser: 'water',
};

/** A first line short enough to be a name ("Interim Zentralbibliothek"), else none. */
const MAX_NAME_FROM_DESCRIPTION = 60;

/**
 * One layer of Köln's cool places: a description alone, no name. The position
 * comes from `Koordinate_WGS84` (the geometry is EPSG:25832). The first line
 * of the description becomes the name when it is short and the description
 * has more lines; the rest is the note.
 */
export function parseKoelnCoolPlaces(json: unknown, layer: KoelnCoolLayer): HeatReliefPlace[] | null {
  const features = featuresOf(json);
  if (!features) return null;
  return features.flatMap((f) => {
    const p = f.properties ?? {};
    const pos = latCommaLon(p.Koordinate_WGS84) ?? utmPoint(f);
    if (!pos) return [];
    const raw = typeof p['Beschreibung_des_kühlen_Ortes'] === 'string' ? p['Beschreibung_des_kühlen_Ortes'] : '';
    const lines = raw.split(/\s*\n\s*/).map((s) => s.trim()).filter(Boolean);
    const named = lines.length > 1 && lines[0]!.length <= MAX_NAME_FROM_DESCRIPTION;
    return [at('cool', pos, {
      name: named ? lines[0]! : '',
      note: clip(text((named ? lines.slice(1) : lines).join('\n'))),
      setting: KOELN_SETTING[layer],
    })];
  });
}

/** A point in EPSG:25832, converted, or null. */
function utmPoint(f: Feature): [number, number] | null {
  const xy = lonLat(f);
  return xy ? utm32ToLonLat(xy[0], xy[1]) : null;
}

/** Köln's drinking fountains: the location, in EPSG:25832. */
export function parseKoelnFountains(json: unknown): HeatReliefPlace[] | null {
  const features = featuresOf(json);
  if (!features) return null;
  return features.flatMap((f) => {
    const pos = utmPoint(f);
    if (!pos) return [];
    return [at('fountain', pos, { name: text(f.properties?.Standort) ?? '' })];
  });
}

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

const KOELN_FEE_PHRASE = /^Nutzungsgebühr:\s*(?:kostenlos|\d+(?:,\d+)?\s*€)\s*[.,]?\s*/i;

/** "Nutzungsgebühr: 0,50 €" → 0.5, "Nutzungsgebühr: Kostenlos" → 0. */
function koelnFee(description: string): number | undefined {
  const m = /Nutzungsgebühr:\s*([^;.]+)/i.exec(description);
  if (!m) return undefined;
  if (/kostenlos/i.test(m[1]!)) return 0;
  const n = /(\d+(?:,\d+)?)\s*€/.exec(m[1]!);
  return n ? Number(n[1]!.replace(',', '.')) : undefined;
}

/**
 * AWB Köln's toilet list (`<addresses><address>…`): name, street, hours, the
 * fee from the description, and the type with the rest of the description as
 * the note. The `infrastructure` codes are undocumented and left out.
 */
export function parseKoelnToilets(body: string): HeatReliefPlace[] | null {
  let doc: unknown;
  try {
    doc = xml.parse(body);
  } catch {
    return null;
  }
  const root = (doc as { addresses?: { address?: unknown } } | null)?.addresses;
  if (!root || typeof root !== 'object') return null;
  const list = root.address === undefined ? [] : Array.isArray(root.address) ? root.address : [root.address];
  return (list as Props[]).flatMap((a) => {
    const pos = latCommaLon(a.coordinates);
    if (!pos) return [];
    const description = typeof a.description === 'string' ? a.description : '';
    // The fee has its own field; what follows it ("…, kein Winterdienst.") stays
    const rest = description.split(';')
      .map((s) => s.trim().replace(KOELN_FEE_PHRASE, '').trim())
      .filter((s) => s !== '');
    const note = [text(a.type), ...rest].filter(Boolean).join('. ');
    return [at('toilet', pos, {
      name: text(a.name) ?? '',
      address: text(a.street),
      hours: text(a.opening),
      fee: koelnFee(description),
      note: clip(note || undefined),
    })];
  });
}

// --- München (GeodatenService WFS, dl-de/by-2.0) ---

/** München's drinking fountains (Baureferat): name and remark ("Dauerläufer 24/7", "Winterabdeckung"). */
export function parseMuenchenFountains(json: unknown): HeatReliefPlace[] | null {
  const features = featuresOf(json);
  if (!features) return null;
  return features.flatMap((f) => {
    const pos = lonLat(f);
    const p = f.properties ?? {};
    if (!pos) return [];
    return [at('fountain', pos, { name: text(p.bezeichnung) ?? text(p.objekt) ?? '', note: clip(text(p.bemerkung)) })];
  });
}

/**
 * München's toilets: the list has one row per room (men, women, accessible),
 * so rows at the same point are one place. Its name drops the room letter
 * ("… Großhadern H"); it is accessible when one room is barrierefrei, has a
 * changing table when one room has, is out of order when every room is
 * "defekt oder nicht zugänglich", and shows the highest fee of its rooms.
 */
export function parseMuenchenToilets(json: unknown): HeatReliefPlace[] | null {
  const features = featuresOf(json);
  if (!features) return null;
  const groups = new Map<string, { pos: [number, number]; rows: Props[] }>();
  for (const f of features) {
    const pos = lonLat(f);
    if (!pos) continue;
    const key = `${round5(pos[0])},${round5(pos[1])}`;
    const group = groups.get(key) ?? { pos, rows: [] };
    group.rows.push(f.properties ?? {});
    groups.set(key, group);
  }
  return [...groups.values()].map(({ pos, rows }) => {
    const first = rows[0]!;
    const fees = rows.map((r) => finite(r.preis)).filter((n): n is number => n !== undefined);
    const street = [text(first.strasse), text(typeof first.hausnr === 'number' ? String(first.hausnr) : first.hausnr)].filter(Boolean).join(' ');
    const notes = [...new Set(rows.map((r) => text(r.einschraenkungen)).filter((s): s is string => s !== undefined))];
    const knowsChanging = rows.some((r) => r.wickeln === 0 || r.wickeln === 1);
    return at('toilet', pos, {
      name: (text(first.name) ?? '').replace(/\s+[A-Z]$/, ''),
      address: street || undefined,
      hours: text(first.oeffnungszeiten),
      fee: fees.length > 0 ? Math.max(...fees) : undefined,
      accessible: rows.some((r) => typeof r.kategorie === 'string' && /barrierefrei/i.test(r.kategorie)) ? 'yes' : undefined,
      changingTable: knowsChanging ? rows.some((r) => r.wickeln === 1) : undefined,
      outOfOrder: rows.every((r) => typeof r.zustand === 'string' && /defekt|nicht zugänglich/i.test(r.zustand)) ? true : undefined,
      note: clip(notes.join('; ') || undefined),
    });
  });
}

/** Parses one response of a source (`layer` for Köln's cool places); null when it is not in the expected format. */
export function parseHeatRelief(source: HeatReliefSource, body: string, layer?: KoelnCoolLayer): HeatReliefPlace[] | null {
  if (source.provider === 'koeln-toilets') return parseKoelnToilets(body);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  switch (source.provider) {
    case 'berlin-cool-rooms': return parseBerlinCoolRooms(json);
    case 'berlin-fountains': return parseBerlinFountains(json);
    case 'berlin-toilets': return parseBerlinToilets(json);
    case 'hamburg-fountains': return parseHamburgFountains(json);
    case 'koeln-cool-places': return parseKoelnCoolPlaces(json, layer ?? 'im_innenraum');
    case 'koeln-fountains': return parseKoelnFountains(json);
    case 'muenchen-fountains': return parseMuenchenFountains(json);
    case 'muenchen-toilets': return parseMuenchenToilets(json);
  }
}
