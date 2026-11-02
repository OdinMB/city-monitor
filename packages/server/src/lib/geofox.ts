/**
 * HVV's Geofox Thin Interface (GTI): request signing and the mapping of
 * `getAnnouncements` onto TransitAlert. Hamburg's transit source
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

// --- Response types (Anwenderhandbuch §2.9, tables 45–47) ---

interface GtiTimeRange { begin?: string; end?: string }

interface GtiSDName {
  name?: string;
  coordinate?: { x?: number; y?: number; type?: string };
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

/** WGS84 point of a stop: GTI's x is the longitude, y the latitude (listing 3); other systems are skipped. */
function pointOf(stop: GtiSDName | undefined): TransitAlert['location'] {
  const c = stop?.coordinate;
  if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') return null;
  if (c.type && c.type !== 'EPSG_4326') return null;
  return { lat: c.y, lon: c.x };
}

function uniquePush(list: string[], value: string | undefined): void {
  if (value && !list.includes(value)) list.push(value);
}

/**
 * The announcements in force at `now` as transit alerts, one per message and
 * affected section: the same text for the same section on several lines
 * becomes one alert listing each line, as VBB remarks do.
 */
export function parseGeofoxAnnouncements(response: GtiAnnouncementResponse, now: Date): TransitAlert[] {
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
      location: pointOf(first?.begin),
      affectedStops: stops.length > 0 ? stops : extractStops(message),
    });
  }

  return [...alerts.values()];
}
