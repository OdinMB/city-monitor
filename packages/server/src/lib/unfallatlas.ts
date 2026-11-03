/**
 * The Unfallatlas of the Statistische Ämter des Bundes und der Länder: every
 * police-recorded road accident with personal injury in Germany, one CSV a
 * year, hosted by open.nrw (dl-de/by-2.0). Picks the newest year from the
 * index and filters the national file to each city by its municipality key.
 * See .context/traffic-accidents.md; field codes in DSB_Unfallatlas.pdf.
 */
import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import type { AccidentSeverity, TrafficAccident } from '@city-monitor/shared';

export const UNFALLATLAS_BASE_URL = 'https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/';
export const UNFALLATLAS_INDEX_URL = `${UNFALLATLAS_BASE_URL}index.json`;

/** Who was involved, as bits of `TrafficAccident`'s last field; the web layer has the same table. */
export const ACCIDENT_PARTICIPANTS = [
  ['IstRad', 1],
  ['IstPKW', 2],
  ['IstFuss', 4],
  ['IstKrad', 8],
  ['IstGkfz', 16],
  ['IstSonstige', 32],
] as const;

export interface UnfallatlasFile {
  year: number;
  url: string;
  /** The file's timestamp in the index (ISO 8601), or null. */
  published: string | null;
}

/**
 * The newest year's CSV archive in `index.json` (`datasets[].files[]`, names
 * like `Unfallorte2025_EPSG25832_CSV.zip`), or null when the index lists none.
 */
export function newestUnfallatlasCsv(index: unknown, baseUrl = UNFALLATLAS_BASE_URL): UnfallatlasFile | null {
  const datasets = (index as { datasets?: unknown })?.datasets;
  if (!Array.isArray(datasets)) return null;
  let best: UnfallatlasFile | null = null;
  for (const ds of datasets) {
    const files = (ds as { files?: unknown })?.files;
    if (!Array.isArray(files)) continue;
    for (const f of files) {
      const name = (f as { name?: unknown })?.name;
      const m = typeof name === 'string' ? /^Unfallorte(\d{4})_EPSG25832_CSV\.zip$/.exec(name) : null;
      if (!m) continue;
      const year = Number(m[1]);
      if (best && best.year >= year) continue;
      const ts = (f as { timestamp?: unknown }).timestamp;
      // The index gives local time without an offset; keep the date and time as given
      const published = typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(ts) ? ts.slice(0, 19) : null;
      best = { year, url: new URL(name as string, baseUrl).href, published };
    }
  }
  return best;
}

/**
 * The key prefix a row's 8-digit municipality key must start with: the whole
 * key for a municipality, the Kreis for a kreisfreie Stadt ("05315000" →
 * "05315": its Gemeinde digits are 000), the Land for a city-state
 * ("11000000" → "11"), whose Bezirke the file codes as Kreise and Gemeinden.
 */
export function agsPrefix(ags: string): string {
  if (!/^\d{8}$/.test(ags)) throw new Error(`not an 8-digit municipality key: ${ags}`);
  if (ags.slice(2) === '000000') return ags.slice(0, 2);
  if (ags.slice(5) === '000') return ags.slice(0, 5);
  return ags;
}

/** The text lines of a byte stream (UTF-8, LF or CRLF), without a leading BOM. */
export async function* streamLines(stream: Readable): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let rest = '';
  let first = true;
  for await (const chunk of stream) {
    rest += decoder.write(chunk as Buffer);
    if (first && rest.length > 0) {
      if (rest.charCodeAt(0) === 0xfeff) rest = rest.slice(1);
      first = false;
    }
    const parts = rest.split('\n');
    rest = parts.pop()!;
    for (const part of parts) yield part.replace(/\r$/, '');
  }
  rest += decoder.end();
  if (rest.length > 0) yield rest.replace(/\r$/, '');
}

const REQUIRED = [
  'ULAND', 'UREGBEZ', 'UKREIS', 'UGEMEINDE', 'UMONAT', 'USTUNDE', 'UWOCHENTAG', 'UKATEGORIE', 'UART', 'UTYP1',
  'XGCSWGS84', 'YGCSWGS84', ...ACCIDENT_PARTICIPANTS.map(([col]) => col),
] as const;

/** A number written with a decimal comma ("13,40512"). */
function decimal(s: string | undefined): number {
  return s === undefined || s === '' ? NaN : Number(s.replace(',', '.'));
}

function int(s: string | undefined): number {
  return s === undefined || !/^\d+$/.test(s) ? NaN : Number(s);
}

function inRange(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

export interface UnfallatlasParseResult {
  /** Accidents per city id, in file order. */
  byCity: Map<string, TrafficAccident[]>;
  /** Rows of the wanted cities left out for a missing or impossible value. */
  skipped: number;
}

/**
 * Reads the national CSV (semicolons, decimal commas) once and keeps the
 * accidents of the given cities, by municipality-key prefix (`agsPrefix`).
 * Throws when a column the layer needs is missing, so a changed format keeps
 * the previous year's data instead of storing an empty one.
 */
export async function parseUnfallatlasCsv(
  lines: AsyncIterable<string>,
  prefixes: ReadonlyArray<{ cityId: string; prefix: string }>,
): Promise<UnfallatlasParseResult> {
  const byCity = new Map<string, TrafficAccident[]>(prefixes.map(({ cityId }) => [cityId, []]));
  const lands = new Set(prefixes.map(({ prefix }) => prefix.slice(0, 2)));
  let col: Record<string, number> | null = null;
  let skipped = 0;

  for await (const line of lines) {
    if (line === '') continue;
    const f = line.split(';');
    if (!col) {
      const header = Object.fromEntries(f.map((name, i) => [name.trim(), i]));
      const missing = REQUIRED.filter((name) => header[name] === undefined);
      if (missing.length > 0) throw new Error(`Unfallatlas CSV lacks ${missing.join(', ')}`);
      col = header;
      continue;
    }
    // Most rows are in other Länder: compare the Land before reading the rest
    const land = f[col.ULAND]?.padStart(2, '0');
    if (!land || !lands.has(land)) continue;
    const key = land + f[col.UREGBEZ] + f[col.UKREIS].padStart(2, '0') + f[col.UGEMEINDE].padStart(3, '0');
    const city = prefixes.find(({ prefix }) => key.startsWith(prefix));
    if (!city) continue;

    const lon = decimal(f[col.XGCSWGS84]);
    const lat = decimal(f[col.YGCSWGS84]);
    const severity = int(f[col.UKATEGORIE]);
    const month = int(f[col.UMONAT]);
    const weekday = int(f[col.UWOCHENTAG]);
    const hour = int(f[col.USTUNDE]);
    const kind = int(f[col.UART]);
    const type = int(f[col.UTYP1]);
    if (
      !Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90
      || !inRange(severity, 1, 3) || !inRange(month, 1, 12) || !inRange(weekday, 1, 7) || !inRange(hour, 0, 23)
      || !inRange(kind, 0, 9) || !inRange(type, 1, 7)
    ) {
      skipped++;
      continue;
    }
    let participants = 0;
    for (const [name, bit] of ACCIDENT_PARTICIPANTS) if (f[col[name]] === '1') participants |= bit;
    byCity.get(city.cityId)!.push([
      Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5,
      severity as AccidentSeverity, month, weekday, hour, kind, type, participants,
    ]);
  }
  if (!col) throw new Error('Unfallatlas CSV is empty');
  return { byCity, skipped };
}
