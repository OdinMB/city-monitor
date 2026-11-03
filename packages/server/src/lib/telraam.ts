/**
 * Parsing for "Berlin zählt Mobilität": hourly counts of citizen-run Telraam
 * sensors, republished as monthly CSVs with a segment GeoJSON (CC BY 4.0).
 * The job keeps one day per segment, compared with the same weekday in the
 * four weeks before. See .context/telraam-counts.md.
 */
import { gunzipSync } from 'node:zlib';
import type { TelraamCountsData, TelraamDayCounts, TelraamSegmentCount } from '@city-monitor/shared';

/**
 * The text of a `.csv.gz` download. berlin-zaehlt.de serves the files with
 * `Content-Encoding: gzip`, so fetch has unpacked them already; a server that
 * sends the raw archive instead still starts with gzip's magic bytes.
 */
export function csvGzText(body: Uint8Array): string {
  const gz = body.length > 2 && body[0] === 0x1f && body[1] === 0x8b;
  return Buffer.from(gz ? gunzipSync(body) : body).toString('utf8');
}

/** Columns the parser reads; a file without one of them is refused. */
const REQUIRED = ['segment_id', 'date_local', 'uptime', 'ped_total', 'bike_total', 'car_total', 'heavy_total'] as const;

/** An hour counts towards `hours` when the sensor was up at least this share of it. */
const MIN_UPTIME = 0.5;
/** How many weeks back the usual value looks, one day (the same weekday) each. */
const BASELINE_WEEKS = 4;
/** The usual value needs at least this many of those days. */
const MIN_BASELINE_DAYS = 2;
/**
 * A day counted for fewer hours than this share of the usual hours gets no
 * comparison: a sensor down for the afternoon would read as a drop in traffic.
 */
const MIN_HOURS_SHARE = 0.75;

/** A segment's place and name from the segment GeoJSON. */
export interface TelraamSegmentInfo {
  lon: number;
  lat: number;
  street: string | null;
  district: string | null;
}

/** One segment on one day: the counts summed over its hours. */
export interface TelraamDay extends TelraamDayCounts {
  hours: number;
}

/** Day totals by local date (YYYY-MM-DD), then by segment id. */
export type TelraamDays = Map<string, Map<number, TelraamDay>>;

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** The point halfway along a line, by length (degrees are close enough to flat over a street). */
export function lineMidpoint(coords: ReadonlyArray<readonly number[]>): [number, number] | null {
  const pts = coords.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (pts.length === 0) return null;
  if (pts.length === 1) return [pts[0][0], pts[0][1]];
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let rest = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (rest <= lengths[i] && lengths[i] > 0) {
      const f = rest / lengths[i];
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    }
    rest -= lengths[i];
  }
  const last = pts[pts.length - 1];
  return [last[0], last[1]];
}

/**
 * The segments inside `region` (an ISO 3166-2 code such as "DE-BE", from each
 * segment's OSM address), by id. The files cover a box around Berlin that
 * reaches into Brandenburg.
 */
export function parseTelraamSegments(geojson: unknown, region: string): Map<number, TelraamSegmentInfo> {
  const out = new Map<number, TelraamSegmentInfo>();
  const features = (geojson as { features?: unknown })?.features;
  if (!Array.isArray(features)) throw new Error('Telraam segments: no features array');
  for (const f of features as Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }>) {
    const p = f.properties ?? {};
    const id = Number(p.segment_id);
    if (!Number.isFinite(id)) continue;
    const osm = (p.osm ?? {}) as { name?: unknown; address?: Record<string, unknown> };
    const address = osm.address ?? {};
    if (address['ISO3166-2-lvl4'] !== region) continue;

    const geom = f.geometry;
    const line = geom?.type === 'MultiLineString'
      ? ((geom.coordinates as number[][][] | undefined) ?? [])[0]
      : geom?.type === 'LineString' ? geom.coordinates as number[][] : undefined;
    const mid = Array.isArray(line) ? lineMidpoint(line) : null;
    if (!mid) continue;

    const name = Array.isArray(osm.name) ? osm.name.filter((n) => typeof n === 'string').join(' / ') : osm.name;
    const district = address.suburb ?? address.borough;
    out.set(id, {
      lon: round5(mid[0]),
      lat: round5(mid[1]),
      street: typeof name === 'string' && name !== '' ? name : null,
      district: typeof district === 'string' && district !== '' ? district : null,
    });
  }
  return out;
}

/**
 * Adds one monthly CSV's rows to `days`, summing each segment's hours per
 * local date. Rows of segments not in `segments` (outside the region) are
 * skipped. Throws when a required column is missing.
 */
export function addTelraamCsv(csv: string, segments: ReadonlyMap<number, unknown>, days: TelraamDays): void {
  const lines = csv.split(/\r?\n/);
  const header = lines[0]?.split(',').map((h) => h.trim()) ?? [];
  const col = Object.fromEntries(REQUIRED.map((name) => [name, header.indexOf(name)])) as Record<typeof REQUIRED[number], number>;
  const missing = REQUIRED.filter((name) => col[name] < 0);
  if (missing.length > 0) throw new Error(`Telraam CSV lacks ${missing.join(', ')}`);

  const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split(',');
    const id = Number(cells[col.segment_id]);
    if (!segments.has(id)) continue;
    const date = cells[col.date_local]?.slice(0, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    let byDate = days.get(date);
    if (!byDate) days.set(date, (byDate = new Map()));
    let day = byDate.get(id);
    if (!day) byDate.set(id, (day = { cars: 0, bikes: 0, pedestrians: 0, heavy: 0, hours: 0 }));
    day.cars += num(cells[col.car_total]);
    day.bikes += num(cells[col.bike_total]);
    day.pedestrians += num(cells[col.ped_total]);
    day.heavy += num(cells[col.heavy_total]);
    if (num(cells[col.uptime]) >= MIN_UPTIME) day.hours += 1;
  }
}

/** A day with counts: some hour up, and something counted (a covered lens counts nothing). */
function counted(day: TelraamDay | undefined): day is TelraamDay {
  return !!day && day.hours > 0 && day.cars + day.bikes + day.pedestrians + day.heavy > 0;
}

/** `date` (YYYY-MM-DD) moved by `n` days. */
export function shiftDate(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The local date in `timeZone` (YYYY-MM-DD). */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The months (YYYY_MM, as the file names write them) a day and the baseline weeks before it fall in. */
export function telraamMonths(date: string): string[] {
  const months = [shiftDate(date, -7 * BASELINE_WEEKS), date].map((d) => d.slice(0, 7).replace('-', '_'));
  return [...new Set(months)];
}

/** The newest date before `today` with any segment counted. */
export function latestCountedDay(days: TelraamDays, today: string): string | null {
  const dates = [...days.keys()].filter((d) => d < today).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    if ([...days.get(dates[i])!.values()].some(counted)) return dates[i];
  }
  return null;
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
};

/** The segment's usual counts on the weekday of `date`, or null (see `TelraamSegmentCount.usual`). */
function usualFor(days: TelraamDays, id: number, date: string, day: TelraamDay): TelraamSegmentCount['usual'] {
  const before: TelraamDay[] = [];
  for (let w = 1; w <= BASELINE_WEEKS; w++) {
    const d = days.get(shiftDate(date, -7 * w))?.get(id);
    if (counted(d)) before.push(d);
  }
  if (before.length < MIN_BASELINE_DAYS) return null;
  if (day.hours < median(before.map((d) => d.hours)) * MIN_HOURS_SHARE) return null;
  return {
    cars: median(before.map((d) => d.cars)),
    bikes: median(before.map((d) => d.bikes)),
    pedestrians: median(before.map((d) => d.pedestrians)),
    heavy: median(before.map((d) => d.heavy)),
    days: before.length,
  };
}

/** The counted segments on `date` with their usual values, busiest first. */
export function buildTelraamCounts(days: TelraamDays, segments: ReadonlyMap<number, TelraamSegmentInfo>, date: string): TelraamCountsData {
  const out: TelraamSegmentCount[] = [];
  for (const [id, day] of days.get(date) ?? []) {
    const info = segments.get(id);
    if (!info || !counted(day)) continue;
    out.push({
      id,
      ...info,
      cars: Math.round(day.cars),
      bikes: Math.round(day.bikes),
      pedestrians: Math.round(day.pedestrians),
      heavy: Math.round(day.heavy),
      hours: day.hours,
      usual: usualFor(days, id, date, day),
    });
  }
  out.sort((a, b) => (b.cars + b.bikes + b.heavy) - (a.cars + a.bikes + a.heavy) || a.id - b.id);
  return { date, segments: out };
}
