/**
 * Live traffic counters, one parser per `dataSources.trafficCounts.provider`
 * (.context/traffic-counts.md). Today only Hamburg's infrared counters on the
 * Urban Data Platform's SensorThings API (`hamburg-sta`).
 *
 * Each counter counts one direction at a counting site (a junction or road
 * section). The job reads every counter's hourly datastream twice: once for
 * the newest hour each has (to choose the hour to show), then for that hour
 * and the same local hour on the same weekday in the four weeks before. A
 * site's numbers are the sums over its counters; its usual count is the sum of
 * each counter's median over those weeks.
 */
import type { CityConfig, TrafficCountMode, TrafficCountSite } from '@city-monitor/shared';

type BoundingBox = CityConfig['boundingBox'];

const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/** The weeks before the counted hour whose same hour makes up the usual count. */
export const REFERENCE_WEEKS = 4;
/** A counter needs this many of those weeks for a usual count: one week alone may be a holiday. */
export const MIN_REFERENCES = 2;
/** A counter whose newest hour is older than this takes no part in choosing the hour to show. */
export const COUNTER_FRESH_MS = 6 * HOUR_MS;
/**
 * The hour shown is the newest that at least this share of the working
 * counters has reached. Hamburg's counters deliver an hour within one to two
 * hours of its end, not all at once; showing the newest hour any counter has
 * would leave most sites out.
 */
export const HOUR_QUORUM = 2 / 3;

const HAMBURG_TIME_ZONE = 'Europe/Berlin';

/** The hourly datastreams of each mode, by name. Retired ones end in "(veraltet)" and fall out. */
const HAMBURG_NAME_PREFIX: Record<TrafficCountMode, string> = {
  car: 'Kfz-Aufkommen an Verkehrszählstelle',
  bike: 'Fahrrad-Aufkommen an Verkehrszählstelle',
};
const HAMBURG_HOURLY_SUFFIX = 'im 1-Stunde-Intervall';

/** The site lists of the Verkehrszählstellen WFS, by mode. */
export const HAMBURG_SITE_TYPENAMES: Record<TrafficCountMode, string> = {
  car: 'app:kfz_zaehlstellen',
  bike: 'app:radverkehr_zaehlstellen',
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** About a metre: enough for a map marker. */
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** An instant as the SensorThings filter syntax takes it: ISO 8601 without milliseconds. */
const isoSeconds = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

function hourlyFilter(mode: TrafficCountMode): string {
  return `startswith(name,'${HAMBURG_NAME_PREFIX[mode]}') and endswith(name,'${HAMBURG_HOURLY_SUFFIX}')`;
}

/**
 * Every hourly counter of a mode with its site, position and newest
 * observation. One page: 829 car and 313 bike counters on 2026-11-03.
 */
export function hamburgLatestUrl(baseUrl: string, mode: TrafficCountMode): string {
  const params = new URLSearchParams({
    $filter: hourlyFilter(mode),
    $select: '@iot.id,properties',
    $expand: 'Thing($select=name;$expand=Locations($select=location)),Observations($select=phenomenonTime,result;$top=1;$orderby=phenomenonTime desc)',
    $top: '1000',
  });
  return `${baseUrl}/Datastreams?${params.toString()}`;
}

/** The same counters with their observations in the given hours (start instants) only. */
export function hamburgHoursUrl(baseUrl: string, mode: TrafficCountMode, hours: readonly number[]): string {
  const windows = hours
    .map((h) => `(phenomenonTime ge ${isoSeconds(h)} and phenomenonTime lt ${isoSeconds(h + HOUR_MS)})`)
    .join(' or ');
  const params = new URLSearchParams({
    $filter: hourlyFilter(mode),
    $select: '@iot.id',
    $expand: `Observations($select=phenomenonTime,result;$top=${hours.length * 2};$filter=${windows})`,
    $top: '1000',
  });
  return `${baseUrl}/Datastreams?${params.toString()}`;
}

/** The WFS request for a mode's counting sites, which carry the junction names. */
export function hamburgSitesUrl(wfsUrl: string, mode: TrafficCountMode): string {
  return `${wfsUrl}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeNames=${HAMBURG_SITE_TYPENAMES[mode]}&outputFormat=application/geo%2Bjson`;
}

/** One directional counter. */
export interface Counter {
  /** The datastream id. */
  id: string;
  /** The counting site it belongs to ("0248"). */
  site: string;
  lat: number;
  lon: number;
  /** Start of its newest hour (ms), null when it has none. */
  latest: number | null;
}

interface StaDatastream {
  '@iot.id'?: unknown;
  properties?: { assetID?: unknown };
  Thing?: { Locations?: Array<{ location?: { geometry?: { coordinates?: unknown }; coordinates?: unknown } }> };
  Observations?: Array<{ phenomenonTime?: unknown; result?: unknown }>;
}

/** The start of an observation's phenomenonTime ("start/end" or an instant), ms. */
function startOf(phenomenonTime: unknown): number | null {
  if (typeof phenomenonTime !== 'string') return null;
  const t = Date.parse(phenomenonTime.split('/')[0]!);
  return Number.isFinite(t) ? t : null;
}

const datastreamsOf = (json: unknown): StaDatastream[] | null => {
  const value = (json as { value?: unknown } | null)?.value;
  return Array.isArray(value) ? (value as StaDatastream[]) : null;
};

/**
 * The counters from the newest-observation query inside the city's box. Null
 * when the body is not a SensorThings collection.
 */
export function parseHamburgCounters(json: unknown, box: BoundingBox): Counter[] | null {
  const streams = datastreamsOf(json);
  if (!streams) return null;
  const counters: Counter[] = [];
  for (const d of streams) {
    const id = d?.['@iot.id'];
    const site = d.properties?.assetID;
    if ((!isNum(id) && typeof id !== 'string') || typeof site !== 'string' || site === '') continue;
    const loc = d.Thing?.Locations?.[0]?.location;
    const coords = loc?.geometry?.coordinates ?? loc?.coordinates;
    if (!Array.isArray(coords)) continue;
    const [lon, lat] = coords as unknown[];
    if (!isNum(lat) || !isNum(lon)) continue;
    if (lat < box.south || lat > box.north || lon < box.west || lon > box.east) continue;
    counters.push({ id: String(id), site, lat, lon, latest: startOf(d.Observations?.[0]?.phenomenonTime) });
  }
  return counters;
}

/**
 * The hour to show: the newest hour start that at least `HOUR_QUORUM` of the
 * counters heard from in the last `COUNTER_FRESH_MS` have reached. Null when
 * none has been heard from.
 */
export function pickCountHour(latest: ReadonlyArray<number | null>, now: number): number | null {
  const fresh = latest.filter((t): t is number => t !== null && now - t <= COUNTER_FRESH_MS);
  if (fresh.length === 0) return null;
  const hours = [...new Set(fresh)].sort((a, b) => b - a);
  for (const h of hours) {
    if (fresh.filter((t) => t >= h).length >= HOUR_QUORUM * fresh.length) return h;
  }
  return hours.at(-1)!;
}

/** The zone's offset from UTC at an instant, ms (Europe/Berlin: one or two hours). */
export function utcOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return local - Math.floor(at / 60_000) * 60_000;
}

/**
 * The starts of the same local hour on the same weekday in each of the
 * `weeks` weeks before `hour`. Across a clock change, a week back is an hour
 * more or less than 168 hours.
 */
export function referenceHours(hour: number, weeks = REFERENCE_WEEKS, timeZone = HAMBURG_TIME_ZONE): number[] {
  const offset = utcOffsetMs(hour, timeZone);
  return Array.from({ length: weeks }, (_, i) => {
    const shifted = hour - (i + 1) * WEEK_MS;
    return shifted + (offset - utcOffsetMs(shifted, timeZone));
  });
}

/** Each counter's count in the hour shown and its counts in the reference hours. */
export interface CounterHours {
  count: number | null;
  references: number[];
}

/**
 * The windowed query's observations per counter: the one in `hour` and those
 * in `references`. Null when the body is not a SensorThings collection.
 */
export function parseHamburgHours(json: unknown, hour: number, references: readonly number[]): Map<string, CounterHours> | null {
  const streams = datastreamsOf(json);
  if (!streams) return null;
  const refs = new Set(references);
  const out = new Map<string, CounterHours>();
  for (const d of streams) {
    const id = d?.['@iot.id'];
    if (!isNum(id) && typeof id !== 'string') continue;
    const entry: CounterHours = { count: null, references: [] };
    for (const o of d.Observations ?? []) {
      const start = startOf(o?.phenomenonTime);
      if (start === null || !isNum(o.result) || o.result < 0) continue;
      if (start === hour) entry.count = o.result;
      else if (refs.has(start)) entry.references.push(o.result);
    }
    out.set(String(id), entry);
  }
  return out;
}

/** Site number → junction name from a Verkehrszählstellen WFS answer (GeoJSON). */
export function parseHamburgSiteNames(json: unknown): Map<string, string> {
  const names = new Map<string, string>();
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return names;
  for (const f of features as Array<{ properties?: { zaehlstelle?: unknown; bezeichnung?: unknown } }>) {
    const site = f?.properties?.zaehlstelle;
    const name = f?.properties?.bezeichnung;
    if (typeof site === 'string' && typeof name === 'string' && name.trim() !== '') names.set(site, name.trim());
  }
  return names;
}

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * One entry per site with a count in `hour`. Where some of a site's counters
 * have a usual count (`MIN_REFERENCES` weeks), the site compares those
 * counters alone, so both sums cover the same directions; where none has, it
 * shows the count of all its counters without a comparison. The position is
 * the middle of the site's counters.
 */
export function aggregateSites(
  mode: TrafficCountMode,
  counters: readonly Counter[],
  hours: ReadonlyMap<string, CounterHours>,
  names: ReadonlyMap<string, string>,
  hour: number,
): TrafficCountSite[] {
  const bySite = new Map<string, Array<{ counter: Counter; count: number; typical: number | null }>>();
  for (const counter of counters) {
    const h = hours.get(counter.id);
    if (!h || h.count === null) continue;
    const typical = h.references.length >= MIN_REFERENCES ? median(h.references) : null;
    const list = bySite.get(counter.site) ?? [];
    list.push({ counter, count: h.count, typical });
    bySite.set(counter.site, list);
  }

  const sites: TrafficCountSite[] = [];
  for (const [site, list] of bySite) {
    const compared = list.filter((c) => c.typical !== null);
    const used = compared.length > 0 ? compared : list;
    const sum = (f: (c: (typeof list)[number]) => number) => used.reduce((s, c) => s + f(c), 0);
    sites.push({
      id: `${mode}-${site}`,
      mode,
      site,
      name: names.get(site) ?? null,
      lat: round5(list.reduce((s, c) => s + c.counter.lat, 0) / list.length),
      lon: round5(list.reduce((s, c) => s + c.counter.lon, 0) / list.length),
      hour: new Date(hour).toISOString(),
      count: sum((c) => c.count),
      typical: compared.length > 0 ? Math.round(sum((c) => c.typical!)) : null,
      counters: used.length,
    });
  }
  return sites.sort((a, b) => a.site.localeCompare(b.site));
}
