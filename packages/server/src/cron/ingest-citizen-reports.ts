/**
 * Citizen issue reports (litter, broken street lights, damaged paths) from a
 * city's Open311 GeoReport v2 server: Köln's "Sag's uns" (dl-de/zero-2.0) and
 * München's "Mach München besser" (CC0 1.0), both on Mark-a-Spot. See
 * .context/citizen-reports.md.
 *
 * The reports are public on the portals, but their free text often carries
 * the reporter's name or phone number, and their photos may show people. Only
 * the category, status, dates, a rounded position and the link to the portal
 * are kept; description, address, media and official replies are dropped here
 * and never stored.
 */
import type { CitizenReport, CitizenReportData, CitizenReportGroup, CitizenReportSource, CitizenReportStatus } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveCitizenReports } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-citizen-reports');

const FETCH_TIMEOUT_MS = 30_000;
/** Two job runs: a missed run keeps the reports, a second one lets them lapse to the DB fallback. */
export const CITIZEN_REPORTS_TTL_SECONDS = 1800;
/** How far back the map reaches. */
export const REPORT_WINDOW_DAYS = 14;
/** The newest this many are served; Köln has about 75 a day (2026-11). */
export const MAX_REPORTS = 1000;
/** Mark-a-Spot's largest page: Köln answers a larger `limit` with its default of 100. */
export const PAGE_SIZE = 200;
/** A run stops after this many pages (3,000 reports), far above a fortnight of either city. */
export const MAX_PAGES = 15;
/** Pause between pages, to be gentle with the city's server. */
const PAGE_PAUSE_MS = 500;
/**
 * A city's reports reach Postgres at most this often (a run every 15 min
 * would store ~250 KB for Köln each time). The DB is only the fallback after
 * a restart, which reruns the job anyway: its freshness check wants 15 min.
 */
export const DB_SAVE_INTERVAL_MS = 55 * 60_000;

/** One request as Mark-a-Spot's GeoReport v2 sends it, with its extensions (`extensions=true`). */
interface Open311Request {
  service_request_id?: unknown;
  service_name?: unknown;
  status?: unknown;
  lat?: unknown;
  long?: unknown;
  requested_datetime?: unknown;
  updated_datetime?: unknown;
  extended_attributes?: {
    markaspot?: {
      nid?: unknown;
      status_descriptive_name?: unknown;
      status_notes?: Array<{ status_descriptive_name?: unknown }>;
    };
  };
}

/**
 * The map group of a portal category, from words in its name. Order matters:
 * "Leuchte verschmutzt" is lighting and "Ampel verschmutzt" traffic before
 * "verschmutzt" makes it waste; "Zu kurze Grünzeit" is traffic before "Grün"
 * makes it green.
 */
const GROUP_PATTERNS: ReadonlyArray<[CitizenReportGroup, RegExp]> = [
  ['lighting', /leucht|licht|beleuchtung/i],
  ['traffic', /ampel|verkehrszeichen|verkehrsschild|grüne welle|rotzeit|grünzeit|schutzzeit|markierung|parkschein|umlaufsperr|drängelgitter/i],
  ['vehicles', /schrott/i],
  ['graffiti', /graffiti|plakat|werbung/i],
  ['waste', /müll|container|wertstoff|verdreckt|verschmutzt|überfüllt|kotbeutel|altkleider|stadtbild/i],
  ['green', /grün|park|spiel|bolzplatz|baum|brunnen|\bbank\b|bänke/i],
  ['roads', /straße|strasse|weg|oberfläche|gully|ablauf|kanaldeckel|baustelle/i],
];

export function reportGroup(category: string): CitizenReportGroup {
  for (const [group, pattern] of GROUP_PATTERNS) {
    if (pattern.test(category)) return group;
  }
  return 'other';
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Open311 knows only open and closed; Mark-a-Spot's status name says whether
 * an open request is being worked on ("In Bearbeitung").
 */
export function reportStatus(status: string | null, label: string | null): CitizenReportStatus {
  if (status === 'closed') return 'closed';
  if (label && /bearbeitung|in arbeit|in progress/i.test(label)) return 'in_progress';
  return 'open';
}

/** The request's page on the portal, or null when the template needs a node id the request lacks. */
export function requestPageUrl(template: string, id: string, nid: string | null): string | null {
  if (template.includes('{nid}') && !nid) return null;
  return template.replace('{id}', encodeURIComponent(id)).replace('{nid}', encodeURIComponent(nid ?? ''));
}

/** One request as a report, or null without id, category, date or a position. */
export function parseOpen311Request(raw: Open311Request, source: CitizenReportSource): CitizenReport | null {
  const id = str(raw.service_request_id);
  const category = str(raw.service_name);
  const requestedAt = str(raw.requested_datetime);
  const lat = num(raw.lat);
  const lon = num(raw.long);
  if (!id || !category || !requestedAt || lat === null || lon === null || (lat === 0 && lon === 0)) return null;
  if (Number.isNaN(Date.parse(requestedAt))) return null;
  const mas = raw.extended_attributes?.markaspot;
  const notes = Array.isArray(mas?.status_notes) ? mas.status_notes : [];
  const statusLabel = str(mas?.status_descriptive_name) ?? str(notes.at(-1)?.status_descriptive_name);
  const nid = str(mas?.nid) ?? (typeof mas?.nid === 'number' ? String(mas.nid) : null);
  return {
    id,
    lat: round4(lat),
    lon: round4(lon),
    category,
    group: reportGroup(category),
    status: reportStatus(str(raw.status), statusLabel),
    statusLabel,
    requestedAt,
    updatedAt: str(raw.updated_datetime),
    url: requestPageUrl(source.requestUrl, id, nid),
  };
}

/** The reports newest first, each once, capped at `cap`, with counts by status. */
export function buildCitizenReportData(reports: readonly CitizenReport[], windowDays = REPORT_WINDOW_DAYS, cap = MAX_REPORTS): CitizenReportData {
  const byId = new Map<string, CitizenReport>();
  for (const r of reports) byId.set(r.id, r);
  const sorted = [...byId.values()].sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt) || b.id.localeCompare(a.id));
  const kept = sorted.slice(0, cap);
  const counts: Record<CitizenReportStatus, number> = { open: 0, in_progress: 0, closed: 0 };
  for (const r of kept) counts[r.status]++;
  return { reports: kept, windowDays, total: sorted.length, counts };
}

/** "2026-11-01T00:00:00Z": second precision, as GeoReport's start_date takes it. */
function isoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Every request since `since`, page by page. Mark-a-Spot sorts by request
 * time, oldest first, and its `page` parameter counts from 0 in Köln but
 * from 1 in München, so each page starts at the newest time of the one
 * before (requests at that second come again and are kept once). Null when
 * a page fails: half a window would read as fewer reports.
 */
export async function fetchOpen311Requests(
  cityId: string,
  source: CitizenReportSource,
  since: Date,
  pauseMs = PAGE_PAUSE_MS,
): Promise<Open311Request[] | null> {
  const seen = new Map<string, Open311Request>();
  let cursor = isoSeconds(since);
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0 && pauseMs > 0) await sleep(pauseMs);
    const url = `${source.baseUrl}/requests.json?start_date=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}&extensions=true`;
    const res = await log.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)', Accept: 'application/json' },
    });
    if (!res.ok) {
      log.warn(`${cityId}: Open311 returned ${res.status}`);
      return null;
    }
    const body = await res.json() as unknown;
    if (!Array.isArray(body)) {
      log.warn(`${cityId}: Open311 answer is not a list of requests`);
      return null;
    }
    let newest = cursor;
    let added = 0;
    for (const item of body as Open311Request[]) {
      const id = str(item?.service_request_id);
      if (!id) continue;
      if (!seen.has(id)) added++;
      seen.set(id, item);
      const t = str(item.requested_datetime);
      if (t && !Number.isNaN(Date.parse(t))) {
        const iso = isoSeconds(new Date(t));
        if (iso > newest) newest = iso;
      }
    }
    // A short page is the last; a page that brought nothing new or did not move on would repeat.
    if (body.length < PAGE_SIZE || added === 0 || newest === cursor) return [...seen.values()];
    cursor = newest;
  }
  log.warn(`${cityId}: stopped after ${MAX_PAGES} pages of Open311 requests`);
  return [...seen.values()];
}

export function createCitizenReportIngestion(cache: Cache, db: Db | null = null, opts?: { pauseMs?: number }) {
  const lastSaved = new Map<string, number>();
  return async function ingestCitizenReports(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.citizenReports;
      if (!source) continue;
      try {
        const since = new Date(Date.now() - REPORT_WINDOW_DAYS * 86_400_000);
        const raw = await fetchOpen311Requests(city.id, source, since, opts?.pauseMs);
        if (!raw) continue;
        const reports = raw
          .map((r) => parseOpen311Request(r, source))
          .filter((r): r is CitizenReport => r !== null && Date.parse(r.requestedAt) >= since.getTime());
        const data = buildCitizenReportData(reports);
        cache.set(CK.citizenReports(city.id), data, CITIZEN_REPORTS_TTL_SECONDS);
        if (db && Date.now() - (lastSaved.get(city.id) ?? 0) >= DB_SAVE_INTERVAL_MS) {
          try {
            await saveCitizenReports(db, city.id, data);
            lastSaved.set(city.id, Date.now());
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        log.info(`${city.id}: ${data.reports.length} citizen reports (${data.counts.open} open, ${data.counts.in_progress} in progress, ${data.counts.closed} closed)`);
      } catch (err) {
        log.error(`${city.id} citizen reports failed`, err);
      }
    }
  };
}
