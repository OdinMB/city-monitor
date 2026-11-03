/**
 * HVV's Geofox Thin Interface (GTI): request signing, the mapping of
 * `getAnnouncements` onto TransitAlert, and the `listStations` index that
 * places rail and ferry alerts on the map. Hamburg's transit source
 * (.context/transit.md#hamburg).
 *
 * The API description is the GTI Anwenderhandbuch (https://gti.geofox.de,
 * version 63.4 for API version 63): every call is a POST of a UTF-8 JSON body,
 * authenticated by the headers geofox-auth-user (the application ID HBT
 * issues), geofox-auth-type `HmacSHA1` and geofox-auth-signature, the Base64
 * HMAC-SHA1 of the exact request body keyed with the UTF-8 password (§1.1,
 * §1.3, listing 44).
 *
 * The credentials come from GEOFOX_USER and GEOFOX_PASSWORD only. Hochbahn
 * issues them per operator under terms that forbid passing them on, so a fork
 * requests its own (.context/deployment.md).
 *
 * The same terms forbid passing the content to third parties: these alerts
 * feed City Monitor's own tile only. Keep them out of any export, feed,
 * embeddable widget or LLM input (.context/transit.md#hamburg).
 */

import { createHmac } from 'node:crypto';
import type { TransitAlert } from '@city-monitor/shared';
import { hashString } from './hash.js';
import { classifyDisruption, classifySeverity, extractStops } from './transit-classify.js';

export const DEFAULT_GEOFOX_ENDPOINT = 'https://gti.geofox.de';

/** The API version City Monitor is written against (Anwenderhandbuch 63.4). Without it the server answers as version 1. */
export const GEOFOX_API_VERSION = 63;

export interface GeofoxCredentials {
  user: string;
  password: string;
}

/** The credentials from the environment, or null unless both are set. */
export function geofoxCredentials(env: NodeJS.ProcessEnv = process.env): GeofoxCredentials | null {
  const user = env.GEOFOX_USER?.trim();
  const password = env.GEOFOX_PASSWORD;
  if (!user || !password) return null;
  return { user, password };
}

/** Base64 HMAC-SHA1 of the request body, keyed with the UTF-8 password (Anwenderhandbuch §1.3). */
export function geofoxSignature(body: string, secret: string): string {
  return createHmac('sha1', Buffer.from(secret, 'utf8')).update(body, 'utf8').digest('base64');
}

/** The headers of a signed GTI request whose body is exactly `body`. */
export function geofoxHeaders(body: string, credentials: GeofoxCredentials): Record<string, string> {
  return {
    'Content-Type': 'application/json;charset=UTF-8',
    Accept: 'application/json',
    'geofox-auth-type': 'HmacSHA1',
    'geofox-auth-user': credentials.user,
    'geofox-auth-signature': geofoxSignature(body, credentials.password),
    'X-Platform': 'web',
    'User-Agent': 'CityMonitor/1.0',
  };
}

/**
 * The getAnnouncements request: every current announcement, in German, with
 * the lines and stops filled in (`full`). Filtering to the ones in force now
 * happens here, not through `timeRange`.
 */
export function announcementRequestBody(): string {
  return JSON.stringify({ language: 'de', version: GEOFOX_API_VERSION, full: true, filterPlanned: 'NO_FILTER' });
}

/**
 * The listStations request (Anwenderhandbuch §2.7.1, table 36): the whole
 * station list, as no `dataReleaseID` is sent, with WGS84 coordinates and
 * equivalent stops kept apart ("Rödingsmarkt" and "U Rödingsmarkt" each keep
 * their own entry, so either name matches).
 */
export function stationListRequestBody(): string {
  return JSON.stringify({ language: 'de', version: GEOFOX_API_VERSION, coordinateType: 'EPSG_4326', filterEquivalent: false });
}

// --- Response types (Anwenderhandbuch §2.9, tables 45–47; §2.7.2, tables 37–38) ---

interface GtiTimeRange { begin?: string; end?: string }

interface GtiCoordinate { x?: number; y?: number; type?: string }

interface GtiSDName {
  name?: string;
  city?: string;
  id?: string;
  coordinate?: GtiCoordinate;
}

export interface GtiStationListEntry {
  id?: string;
  name?: string;
  city?: string;
  combinedName?: string;
  aliasses?: string[];
  coordinate?: GtiCoordinate;
  /** false on a deleted station, which then carries only its id */
  exists?: boolean;
}

export interface GtiStationListResponse {
  returnCode?: string;
  errorText?: string;
  errorDevInfo?: string;
  dataReleaseID?: string;
  stations?: GtiStationListEntry[];
}

interface GtiLocation {
  type?: 'SINGLE_LINE' | 'ALL_LINES_OF_CARRIER' | 'COMPLETE_NET' | string;
  name?: string;
  line?: { name?: string };
  begin?: GtiSDName;
  end?: GtiSDName;
}

export interface GtiAnnouncement {
  id?: string;
  summary?: string;
  description?: string;
  locations?: GtiLocation[];
  publication?: GtiTimeRange;
  validities?: GtiTimeRange[];
  planned?: boolean;
  reason?: string;
}

export interface GtiAnnouncementResponse {
  returnCode?: string;
  errorText?: string;
  errorDevInfo?: string;
  announcements?: GtiAnnouncement[];
  lastUpdate?: string;
}

/**
 * GTI dateTimes carry their offset without a colon ("2017-10-12T08:00:00.000+0200"),
 * which Date.parse does not promise to read; NaN when unreadable.
 */
export function parseGtiDateTime(value: string | undefined): number {
  if (!value) return NaN;
  return Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
}

function covers(range: GtiTimeRange | undefined, now: number): boolean {
  if (!range) return false;
  const begin = parseGtiDateTime(range.begin);
  const end = parseGtiDateTime(range.end);
  // An unreadable bound does not hide the announcement
  return (Number.isNaN(begin) || begin <= now) && (Number.isNaN(end) || now < end);
}

/**
 * In force now: inside one of its validities, the periods in which trips are
 * affected. An announcement inside its publication period but outside every
 * validity is an advance notice (§2.9.2) and left out, as VBB's tile shows only
 * current disruptions. Without validities, the publication period decides.
 */
export function isInForce(a: GtiAnnouncement, now: number): boolean {
  if (a.validities && a.validities.length > 0) return a.validities.some((v) => covers(v, now));
  return a.publication ? covers(a.publication, now) : true;
}

const MESSAGE_MAX = 160;

/**
 * The short text: GTI's summary, which unplanned announcements lack (§2.9.2,
 * table 46); then the description's first sentence, shortened if long. The
 * full description stays in `detail`.
 */
function messageOf(a: GtiAnnouncement, description: string): string {
  const summary = a.summary?.trim();
  if (summary) return summary;
  const flat = description.replace(/\s+/g, ' ').trim();
  const sentence = flat.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? flat;
  return sentence.length <= MESSAGE_MAX ? sentence : `${sentence.slice(0, MESSAGE_MAX - 1).trimEnd()}…`;
}

/** A line for a single-line location; the carrier or network name for the wider ones. */
function lineOf(location: GtiLocation): string | undefined {
  const name = location.type === 'SINGLE_LINE' ? location.line?.name : location.name ?? location.line?.name;
  return name?.trim() || undefined;
}

/**
 * GTI's stand-alone notices on where a regional train's replacement bus stops
 * ("Haltestelleninformation für EV in Husum"), dozens of them, mostly outside
 * Hamburg.
 */
const EV_STOP_NOTICE = /^Haltestelleninformation für EV\b/i;

/** The carriers that run Hamburg's own network, for ALL_LINES_OF_CARRIER locations. */
const HAMBURG_CARRIER = /hochbahn|vhh|hadag|s-bahn|akn|hvv/i;

/**
 * Whether a line belongs to Hamburg's own network (.context/transit.md#hamburg).
 * GTI covers the whole hvv area and beyond, so most of its announcements are
 * about regional buses in Schleswig-Holstein and Lower Saxony.
 *
 * - U-Bahn, S-Bahn, AKN (`U3`, `S5`, `A1`), also their replacement buses (`U3-SEV`);
 * - city buses, Xpressbus, night buses and HADAG ferries: one to three digits,
 *   optionally after an X (`5`, `112`, `X35`, `609`, `62`);
 * - regional trains (`RE7`, `RB61`, `RE7-SEV`), except on the stand-alone
 *   replacement-bus stop notices;
 * - the whole network, and carriers of the city network (Hochbahn, VHH, HADAG,
 *   S-Bahn, AKN).
 *
 * Out: four-digit regional buses (`6560`), suffixed regional lines
 * (`2303-KVG`, `332-VKP`), the bare `SEV` and other carriers (`VKP`).
 */
function isHamburgLine(location: GtiLocation, name: string, evStopNotice: boolean): boolean {
  if (location.type === 'COMPLETE_NET') return true;
  if (location.type === 'ALL_LINES_OF_CARRIER') return HAMBURG_CARRIER.test(name);
  const line = name.toUpperCase();
  if (/^[USA]\d+(-SEV)?$/.test(line)) return true;
  if (/^X?\d{1,3}$/.test(line)) return true;
  if (/^R[EB]\d+(-SEV)?$/.test(line)) return !evStopNotice;
  return false;
}

/** The affected section of a location: "Poppenbüttel – Wedel", one stop, or empty for a whole line. */
function sectionOf(location: GtiLocation | undefined): string {
  const names = [location?.begin?.name?.trim(), location?.end?.name?.trim()].filter((n): n is string => !!n);
  if (names.length === 2 && names[0] === names[1]) return names[0];
  return names.join(' – ');
}

type Point = NonNullable<TransitAlert['location']>;

/** WGS84 point of a coordinate: GTI's x is the longitude, y the latitude (listing 3); other systems are skipped. */
function pointOf(c: GtiCoordinate | undefined): Point | null {
  if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') return null;
  if (c.type && c.type !== 'EPSG_4326') return null;
  return { lat: c.y, lon: c.x };
}

// --- Station list: coordinates for the stops announcements name ---

interface StationCandidate { city: string; point: Point }

/**
 * The station list, reduced to what placing an alert needs: the point of each
 * GTI station id, and the stations under each name (exact, and loose).
 */
export interface StationIndex {
  byId: Map<string, Point>;
  exact: Map<string, StationCandidate[]>;
  loose: Map<string, StationCandidate[]>;
}

/** Case, Unicode form, dashes and spacing evened out: "Alte  Wöhr" = "alte wöhr". */
function exactKey(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * A looser key, compared only with other loose keys: without a mode prefix
 * ("S Nettelnburg", "U/S Barmbek"), a leading "Hamburg" ("Hamburg-Harburg",
 * DB's spelling in regional-train announcements), a bracketed suffix, and with
 * "Hbf" read as GTI's "Hauptbahnhof".
 */
function looseKey(name: string): string {
  return exactKey(name)
    .replace(/^(?:[usa]|[us]\s?[+/]\s?[us]|bf\.?)\s+/, '')
    .replace(/^hamburg[- ]/, '')
    .replace(/\s*\([^)]*\)$/, '')
    .replace(/^hbf\.?$/, 'hauptbahnhof')
    .trim();
}

function addCandidate(map: Map<string, StationCandidate[]>, key: string, candidate: StationCandidate): void {
  if (!key) return;
  const list = map.get(key);
  if (!list) map.set(key, [candidate]);
  else if (!list.includes(candidate)) list.push(candidate);
}

/**
 * The index of a listStations response. Deleted stations and those without a
 * WGS84 coordinate are left out. Each station is found under its name, its
 * combined name and its aliases.
 */
export function buildStationIndex(response: GtiStationListResponse): StationIndex {
  const index: StationIndex = { byId: new Map(), exact: new Map(), loose: new Map() };
  for (const s of response.stations ?? []) {
    if (s.exists === false) continue;
    const point = pointOf(s.coordinate);
    if (!point) continue;
    if (s.id) index.byId.set(s.id, point);
    const candidate: StationCandidate = { city: s.city?.trim() ?? '', point };
    for (const name of [s.name, s.combinedName, ...(s.aliasses ?? [])]) {
      if (!name?.trim()) continue;
      addCandidate(index.exact, exactKey(name), candidate);
      addCandidate(index.loose, looseKey(name), candidate);
    }
  }
  return index;
}

/** Of several stations with one name: the one in the stop's own city, else Hamburg's, else the first. */
function pick(candidates: StationCandidate[] | undefined, city: string | undefined): Point | null {
  if (!candidates || candidates.length === 0) return null;
  const want = city?.trim().toLowerCase();
  const inCity = want ? candidates.find((c) => c.city.toLowerCase() === want) : undefined;
  return (inCity ?? candidates.find((c) => c.city === 'Hamburg') ?? candidates[0]).point;
}

/** A stop's point: its own WGS84 coordinate, else its station id's, else its name's. */
function locateStop(stop: GtiSDName, stations: StationIndex | null | undefined): Point | null {
  const own = pointOf(stop.coordinate);
  if (own || !stations) return own;
  const byId = stop.id ? stations.byId.get(stop.id) : undefined;
  if (byId) return byId;
  const name = stop.name?.trim();
  if (!name) return null;
  return pick(stations.exact.get(exactKey(name)), stop.city) ?? pick(stations.loose.get(looseKey(name)), stop.city);
}

type Bounds = [[number, number], [number, number]];

function inside(point: Point, bounds: Bounds | undefined): boolean {
  if (!bounds) return true;
  const [[west, south], [east, north]] = bounds;
  return point.lon >= west && point.lon <= east && point.lat >= south && point.lat <= north;
}

/**
 * Where the alert goes on the map: the first stop, in the order the locations
 * name them (begin, then end), that has a point inside the map's bounds. A
 * point outside them could never be seen, as the map does not pan past them.
 */
function placeOf(locations: GtiLocation[], places: GeofoxPlaces): Point | null {
  for (const location of locations) {
    for (const stop of [location.begin, location.end]) {
      if (!stop) continue;
      const point = locateStop(stop, places.stations);
      if (point && inside(point, places.bounds)) return point;
    }
  }
  return null;
}

/**
 * HADAG harbour ferries, whose numbers read like buses. The same set as
 * FERRIES in the web app's lib/hvv-lines.ts; change both together.
 */
const HVV_FERRIES = new Set(['61', '62', '64', '65', '68', '72', '73', '75']);

/** U-Bahn, S-Bahn, AKN and regional trains, also their replacement buses (`U3-SEV`), and ferries. */
function isRailOrFerry(line: string): boolean {
  const name = line.trim().toUpperCase();
  return /^(?:[USA]|R[EB])\d+(?:-SEV)?$/.test(name) || HVV_FERRIES.has(name);
}

/**
 * The owner's map scope (.context/transit.md#hamburg): cancellations,
 * disruptions and planned works touching rail or a ferry go on the map. Bus-only
 * alerts, most of them planned diversions and moved stops, stay in the tile.
 */
function belongsOnMap(type: TransitAlert['type'], lines: string[]): boolean {
  return type !== 'delay' && lines.some(isRailOrFerry);
}

/** What placing alerts on the map takes: the station list (null when it failed) and the map's bounds. */
export interface GeofoxPlaces {
  stations?: StationIndex | null;
  bounds?: Bounds;
}

function uniquePush(list: string[], value: string | undefined): void {
  if (value && !list.includes(value)) list.push(value);
}

/**
 * The announcements in force at `now` as transit alerts, one per message and
 * affected section: the same text for the same section on several lines
 * becomes one alert listing each line, as VBB remarks do. With `places`, an
 * alert in the map scope (`belongsOnMap`) gets its first stop's point.
 */
export function parseGeofoxAnnouncements(
  response: GtiAnnouncementResponse, now: Date, places: GeofoxPlaces = {},
): TransitAlert[] {
  const at = now.getTime();
  const alerts = new Map<string, TransitAlert>();

  for (const a of response.announcements ?? []) {
    if (!isInForce(a, at)) continue;
    const description = a.description?.trim() ?? '';
    if (!description && !a.summary?.trim()) continue;

    const message = messageOf(a, description);
    const locations = a.locations ?? [];
    const evStopNotice = EV_STOP_NOTICE.test(message);
    const lines: string[] = [];
    let anyLine = false;
    for (const location of locations) {
      const name = lineOf(location);
      if (!name) continue;
      anyLine = true;
      if (isHamburgLine(location, name, evStopNotice)) uniquePush(lines, name);
    }
    // Every line is outside Hamburg's network; one naming no line at all stays
    if (anyLine && lines.length === 0) continue;

    const stops: string[] = [];
    for (const location of locations) {
      uniquePush(stops, location.begin?.name?.trim());
      uniquePush(stops, location.end?.name?.trim());
    }

    const first = locations.find((l) => l.begin || l.end);
    const station = sectionOf(first);
    const dedupeKey = `${message}:${station}`;

    const existing = alerts.get(dedupeKey);
    if (existing) {
      for (const line of lines) uniquePush(existing.lines, line);
      existing.line = existing.lines.join(', ');
      for (const stop of stops) uniquePush(existing.affectedStops, stop);
      continue;
    }

    let type = classifyDisruption(message);
    if (type === 'disruption' && (a.planned === true || a.reason === 'ROADWORKS')) type = 'planned-work';
    // Planned work never outranks an unplanned disruption: "Sperrung" alone
    // would make every bus diversion high
    let severity = classifySeverity(message);
    if (type === 'planned-work' && severity === 'high') severity = 'medium';

    alerts.set(dedupeKey, {
      id: hashString(dedupeKey),
      line: lines.join(', '),
      lines,
      type,
      severity,
      message,
      detail: description || message,
      station,
      location: belongsOnMap(type, lines) ? placeOf(locations, places) : null,
      affectedStops: stops.length > 0 ? stops : extractStops(message),
    });
  }

  return [...alerts.values()];
}
