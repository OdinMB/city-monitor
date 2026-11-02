import type { CouncilMeeting } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveCouncilMeetings } from '../db/writes.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { getActiveCities } from '../config/index.js';
import { createRateGate } from '../lib/rate-gate.js';
import { parseFeed } from '../lib/rss-parser.js';
import { XMLParser } from 'fast-xml-parser';
import { gzipSync } from 'node:zlib';

const log = createLogger('ingest-council-meetings');

const FETCH_TIMEOUT_MS = 20_000;
const TTL_SECONDS = 25920; // 7.2h (cron every 6h × 1.2 buffer)
const LOOKAHEAD_DAYS = 14;
const DELAY_BETWEEN_DISTRICTS_MS = 1000;

// Browser-like headers required by ALLRIS servers
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; CityMonitor/1.0; +https://citymonitor.app)',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
};

const xmlParser = new XMLParser({ ignoreAttributes: false });

// ── OParl BVV ingestion ─────────────────────────────────────────

interface OparlMeeting {
  id: string;
  name?: string;
  start?: string;
  end?: string;
  cancelled?: boolean | null;
  location?: { description?: string; streetAddress?: string; room?: string };
  agendaItem?: Array<{ number?: string; name?: string; public?: boolean }>;
  web?: string | null;
}

interface OparlResponse {
  data?: OparlMeeting[];
  links?: { next?: string };
}

/**
 * One OParl meeting list to read. Berlin has one server per district, so the
 * district is fixed; Köln has one body for the council, its committees and the
 * district councils, so a meeting's district comes from its name.
 */
export interface OparlTarget {
  /** For log lines. */
  label: string;
  /** The first page of the meeting list. */
  firstUrl: string;
  /** Every meeting of this list is this district's (Berlin BVV). */
  district?: string;
  /** The word naming a district council in a meeting's name; the rest is the district (Köln "Bezirksvertretung"). */
  districtBody?: string;
  /** A meeting's web page is this plus its id's last segment, for a server whose meetings carry no `web`. */
  webUrlPrefix?: string;
  /** Pages to read at most. Default 10. */
  maxPages?: number;
}

export function extractCommittee(name: string): string {
  // OParl names are like "77. Sitzung in der IX. Wahlperiode des Ausschusses ..."
  // Try to extract the committee name after "des/der"
  const match = name.match(/(?:des|der)\s+(.+)$/i);
  return match ? match[1] : name;
}

export function buildLocation(loc: OparlMeeting['location']): string | undefined {
  if (!loc) return undefined;
  const parts = [loc.room, loc.streetAddress ?? loc.description].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * The meetings of one OParl page that fall in the window, and whether any of
 * the page's meetings lies ahead at all. Both servers list meetings newest
 * first (ALLRIS by date, SOMACOS by creation), so a page with nothing ahead
 * ends the walk.
 */
export function parseOparlMeetings(
  data: OparlMeeting[],
  target: OparlTarget,
  now: number,
  windowMs: number,
): { meetings: CouncilMeeting[]; anyInFuture: boolean } {
  const meetings: CouncilMeeting[] = [];
  let anyInFuture = false;
  const districtPattern = target.districtBody
    ? new RegExp(`\\b${target.districtBody}\\s+(.+?)\\s*$`, 'i')
    : null;

  for (const m of data) {
    if (!m.start) continue;

    const t = new Date(m.start).getTime();
    if (Number.isNaN(t) || t < now) continue;
    anyInFuture = true;

    if (t > now + windowMs) continue; // too far in the future
    if (m.cancelled === true) continue;
    // Skip nichtöffentlich (non-public) sessions
    if (m.name && /nichtöffentlich/i.test(m.name)) continue;

    const district = target.district ?? (districtPattern ? m.name?.match(districtPattern)?.[1] : undefined);
    // SOMACOS gives an unknown end as midnight of the meeting day
    const end = m.end && new Date(m.end).getTime() > t ? m.end : undefined;
    const webUrl = m.web
      ?? (target.webUrlPrefix ? `${target.webUrlPrefix}${m.id.split('/').pop()}` : undefined);

    meetings.push({
      id: m.id,
      source: district ? 'bvv' : 'parliament',
      ...(district ? { district } : {}),
      committee: extractCommittee(m.name ?? district ?? target.label),
      start: m.start,
      end,
      location: buildLocation(m.location),
      agendaItems: m.agendaItem?.map((a) => ({
        number: a.number ?? '',
        name: a.name ?? '',
        public: a.public ?? true,
      })),
      webUrl,
    });
  }

  return { meetings, anyInFuture };
}

export async function fetchOparlMeetings(
  target: OparlTarget,
  now: number,
  windowMs: number,
): Promise<CouncilMeeting[]> {
  const meetings: CouncilMeeting[] = [];
  let url: string | undefined = target.firstUrl;
  let pages = 0;

  while (url && pages < (target.maxPages ?? 10)) {
    pages++;
    const res = await log.fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      log.warn(`${target.label} OParl returned ${res.status}`);
      break;
    }

    let json: OparlResponse;
    try {
      json = await res.json() as OparlResponse;
    } catch {
      log.warn(`${target.label} OParl returned invalid JSON`);
      break;
    }

    if (!json.data || json.data.length === 0) break;

    const page = parseOparlMeetings(json.data, target, now, windowMs);
    meetings.push(...page.meetings);

    // If no meetings are in the future, remaining pages are even older
    if (!page.anyInFuture) break;

    url = json.links?.next;
  }

  return meetings;
}

// ── München RIS RSS ─────────────────────────────────────────────

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

/** München's 25 Stadtbezirke, by the number of their Bezirksausschuss (BA). */
const MUENCHEN_BEZIRKE: Record<number, string> = {
  1: 'Altstadt-Lehel', 2: 'Ludwigsvorstadt-Isarvorstadt', 3: 'Maxvorstadt', 4: 'Schwabing-West',
  5: 'Au-Haidhausen', 6: 'Sendling', 7: 'Sendling-Westpark', 8: 'Schwanthalerhöhe',
  9: 'Neuhausen-Nymphenburg', 10: 'Moosach', 11: 'Milbertshofen-Am Hart', 12: 'Schwabing-Freimann',
  13: 'Bogenhausen', 14: 'Berg am Laim', 15: 'Trudering-Riem', 16: 'Ramersdorf-Perlach',
  17: 'Obergiesing-Fasangarten', 18: 'Untergiesing-Harlaching',
  19: 'Thalkirchen-Obersendling-Forstenried-Fürstenried-Solln', 20: 'Hadern',
  21: 'Pasing-Obermenzing', 22: 'Aubing-Lochhausen-Langwied', 23: 'Allach-Untermenzing',
  24: 'Feldmoching-Hasenbergl', 25: 'Laim',
};

const RIS_TITLE = /^(StR|BA)-Sitzung\s+(.+?)\s+am\s+[A-Za-zäöüÄÖÜß]+,\s*(\d{1,2})\.\s*([A-Za-zäöüÄÖÜß]+)\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*Uhr/;

const pad2 = (n: number | string) => String(n).padStart(2, '0');

/**
 * A RIS item title, such as "BA-Sitzung BA 16 - Vollgremium am Donnerstag,
 * 12. November 2026, 19:30 Uhr": the feed, the body, and the start as an ISO
 * time with München's UTC offset on that day (CET or CEST).
 */
export function parseRisTitle(title: string): { kind: 'StR' | 'BA'; body: string; start: string } | null {
  const m = title.trim().match(RIS_TITLE);
  if (!m) return null;
  const [, kind, body, day, monthName, year, hour, minute] = m;
  const month = GERMAN_MONTHS[monthName!.toLowerCase()];
  if (!month || Number(hour) > 23 || Number(minute) > 59) return null;
  const local = `${year}-${pad2(month)}-${pad2(day!)} ${pad2(hour!)}:${minute}:00`;
  return {
    kind: kind as 'StR' | 'BA',
    body: body!,
    start: local.replace(' ', 'T') + berlinUtcOffset(local),
  };
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
};

function decodeHtml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1]?.toLowerCase() === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return HTML_ENTITIES[ref] ?? whole;
  });
}

/** The "Sitzungsort" line of a RIS item description, whose HTML carries its own entities a second time. */
function risLocation(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const m = description.match(/Sitzungsort:\s*<\/strong>\s*([^<]+)/i);
  const place = m ? decodeHtml(m[1]!).replace(/\s+/g, ' ').trim() : '';
  return place || undefined;
}

/**
 * The meetings of one München RIS feed (StR-Sitzungen or BA-Sitzungen) in the
 * window. A Stadtrat committee is the council; a Bezirksausschuss is filed
 * under its Stadtbezirk.
 */
export function parseMuenchenRisFeed(xml: string, now: number, windowMs: number): CouncilMeeting[] {
  const meetings: CouncilMeeting[] = [];
  for (const item of parseFeed(xml)) {
    const parsed = parseRisTitle(item.title);
    if (!parsed) continue;
    const t = new Date(parsed.start).getTime();
    if (t < now || t > now + windowMs) continue;

    const id = `muenchen-ris-${item.url.split('/').pop()}`;
    const location = risLocation(item.description);
    const base = { id, start: parsed.start, ...(location ? { location } : {}), webUrl: item.url };

    if (parsed.kind === 'BA') {
      // "BA 16 - Vollgremium", "BA 3 - Unterausschuss Bau"
      const ba = parsed.body.match(/^BA\s*(\d{1,2})\s*(?:-\s*(.+))?$/);
      const number = ba ? Number(ba[1]) : undefined;
      const district = (number && MUENCHEN_BEZIRKE[number]) || parsed.body;
      const committee = number
        ? `Bezirksausschuss ${number}${ba?.[2] ? ` – ${ba[2].trim()}` : ''}`
        : parsed.body;
      meetings.push({ ...base, source: 'bvv', district, committee });
    } else {
      meetings.push({ ...base, source: 'parliament', committee: parsed.body });
    }
  }
  return meetings;
}

async function fetchMuenchenRis(
  urls: string[],
  now: number,
  windowMs: number,
): Promise<CouncilMeeting[]> {
  const results = await Promise.allSettled(urls.map(async (url) => {
    const res = await log.fetch(url, {
      headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'], Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      log.warn(`München RIS returned ${res.status} for ${url}`);
      return [];
    }
    return parseMuenchenRisFeed(await res.text(), now, windowMs);
  }));
  const meetings: CouncilMeeting[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') meetings.push(...r.value);
    else log.warn(`München RIS failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  }
  return meetings;
}

// ── Hamburg Bürgerschaft calendar ───────────────────────────────

/**
 * The calendar's search state: CoreMedia's result list takes its filter as
 * gzipped JSON in `state`. No date bounds lists from today on, earliest first;
 * 50 hits reach about six weeks ahead.
 */
const BUERGERSCHAFT_STATE = {
  dateFrom: null, dateTo: null, facets: {}, hitsPerPage: 50, query: '',
  sort: 'externallydisplayeddate asc', useDateConstraint: false,
};

export function buergerschaftSearchUrl(calendarUrl: string): string {
  const state = gzipSync(JSON.stringify(BUERGERSCHAFT_STATE)).toString('base64url');
  return `${calendarUrl}?state=${state}`;
}

const BUERGERSCHAFT_ORIGIN = 'https://www.hamburgische-buergerschaft.de';

/** One teaser's text between a class marker and the next tag. */
function teaserField(html: string, marker: RegExp): string | undefined {
  const m = html.match(marker);
  const text = m ? decodeHtml(m[1]!).replace(/\s+/g, ' ').trim() : '';
  return text || undefined;
}

/**
 * The public committee and plenary sessions of one page of the Bürgerschaft's
 * calendar (hamburgische-buergerschaft.de/aktuelles/termine) in the window.
 * The page has no year on its dates: the list starts today and runs forward,
 * so a day before yesterday is next year's. Non-public and cancelled sessions,
 * delegation trips and advisory boards are left out.
 */
export function parseBuergerschaftCalendar(html: string, now: number, windowMs: number): CouncilMeeting[] {
  // The result list ends at its pagination; the slider after it repeats one event
  const list = html.split('bkhh-pagination__form')[0]!;
  const teasers = list.split('<div class="bkhh-teaser bkhh-teaser--events" >').slice(1);
  const today = new Date(now);
  const meetings: CouncilMeeting[] = [];

  for (const teaser of teasers) {
    const kind = teaserField(teaser, /bkhh-teaser__text"\s*>([^<]*)</) ?? '';
    if (!/^(Ausschusssitzung|Sitzung der Bürgerschaft)\b/.test(kind)) continue;
    if (/nicht öffentlich|entfällt/i.test(kind)) continue;

    const committee = teaserField(teaser, /teaser__headline-inner">([^<]*)</);
    const date = teaser.match(/bkhh-date" aria-label="(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)"/);
    const time = teaser.match(/bkhh-icon-label__label">(\d{1,2}):(\d{2})</);
    const id = teaser.match(/\/(\d+)!ical/)?.[1];
    if (!committee || !date || !time || !id) continue;

    const month = GERMAN_MONTHS[date[2]!.toLowerCase()];
    if (!month) continue;
    const startOn = (year: number) => {
      const local = `${year}-${pad2(month)}-${pad2(date[1]!)} ${pad2(time[1]!)}:${time[2]}:00`;
      return local.replace(' ', 'T') + berlinUtcOffset(local);
    };
    let start = startOn(today.getUTCFullYear());
    if (new Date(start).getTime() < now - 2 * 86_400_000) start = startOn(today.getUTCFullYear() + 1);
    const t = new Date(start).getTime();
    if (t < now || t > now + windowMs) continue;

    // The location label is the one after the location icon
    const location = teaserField(teaser, /icon-label-container--location">[\s\S]*?bkhh-icon-label__label">([^<]*)</);
    // The agenda PDF once it is out (other PDFs are notices), else the committee's page, else the calendar
    const agenda = teaser.match(/href="(\/resource\/blob\/[^"]+\.pdf)">\s*<span class="bkhh-link__text">Tagesordnung</)?.[1];
    const committeePage = teaser.match(/href="(\/unsere-arbeit\/ausschuesse\/[^"]+)"/)?.[1];

    meetings.push({
      id: `hh-buergerschaft-${id}`,
      source: 'parliament',
      committee,
      start,
      ...(location ? { location } : {}),
      webUrl: `${BUERGERSCHAFT_ORIGIN}${agenda ?? committeePage ?? '/aktuelles/termine'}`,
    });
  }
  return meetings;
}

async function fetchBuergerschaftCalendar(calendarUrl: string, now: number, windowMs: number): Promise<CouncilMeeting[]> {
  const url = buergerschaftSearchUrl(calendarUrl);
  const get = () => log.fetch(url, {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // The site's front resets a share of TLS connections; a second try gets through
  const res = await get().catch(get);
  if (!res.ok) {
    log.warn(`Hamburg Bürgerschaft calendar returned ${res.status}`);
    return [];
  }
  return parseBuergerschaftCalendar(await res.text(), now, windowMs);
}

// ── PARDOK XML ingestion ────────────────────────────────────────

/** Determine CET (+01:00) or CEST (+02:00) offset for a given date in Europe/Berlin */
export function berlinUtcOffset(dateStr: string): string {
  // Parse as UTC first to get a Date object for DST detection
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  // Compare UTC hour to Berlin hour to derive offset numerically.
  // This avoids platform-dependent timezone name strings (e.g. "CEST" on
  // Linux vs "GMT+2" on Windows).
  const utcHour = d.getUTCHours();
  const berlinHour = Number(
    new Intl.DateTimeFormat('en', {
      timeZone: 'Europe/Berlin',
      hour: 'numeric',
      hour12: false,
    }).format(d),
  );
  // Handle day wrap (e.g., UTC 23:00 → Berlin 01:00 next day = +2)
  const diff = ((berlinHour - utcHour) + 24) % 24;
  return diff === 2 ? '+02:00' : '+01:00';
}

interface PardokRow {
  Termin_ID: string;
  committee_name: string;
  wahlperiode: string;
  date_time: string;
  date_time_end?: string;
  title: string;
}

export function parsePardokXml(xmlText: string, type: 'committee' | 'plenary', now: number, windowMs: number): CouncilMeeting[] {
  const parsed = xmlParser.parse(xmlText);
  const rows: PardokRow[] = [];

  // XML structure: resultset.row[].field[]
  const rawRows = parsed?.resultset?.row;
  // fast-xml-parser returns an object (not array) for a single <row> element
  const normalizedRows = Array.isArray(rawRows) ? rawRows : rawRows ? [rawRows] : [];

  for (const row of normalizedRows) {
    const fields = Array.isArray(row.field) ? row.field : [];
    const obj: Record<string, string> = {};
    for (const f of fields) {
      if (typeof f === 'object' && f !== null && '#text' in f) {
        obj[f['@_name'] ?? ''] = String(f['#text']);
      } else if (typeof f === 'string') {
        // nil fields come as empty strings
      }
    }
    if (obj.Termin_ID && obj.date_time) {
      rows.push({
        Termin_ID: obj.Termin_ID,
        committee_name: obj.committee_name ?? 'Unknown',
        wahlperiode: obj.wahlperiode ?? '',
        date_time: obj.date_time,
        date_time_end: obj.date_time_end,
        title: obj.title ?? '',
      });
    }
  }

  const meetings: CouncilMeeting[] = [];
  for (const row of rows) {
    // PARDOK dates are "YYYY-MM-DD HH:mm:ss" in Europe/Berlin local time
    const offset = berlinUtcOffset(row.date_time);
    const isoStart = row.date_time.replace(' ', 'T') + offset;
    const t = new Date(isoStart).getTime();
    if (t < now || t > now + windowMs) continue;

    meetings.push({
      id: `pardok-${row.Termin_ID}`,
      source: 'parliament',
      committee: row.committee_name,
      start: isoStart,
      end: row.date_time_end ? row.date_time_end.replace(' ', 'T') + berlinUtcOffset(row.date_time_end) : undefined,
      webUrl: 'https://www.parlament-berlin.de/termine',
    });
  }

  return meetings;
}

async function fetchPardokSchedules(
  committeeUrl: string,
  plenaryUrl: string,
  now: number,
  windowMs: number,
): Promise<CouncilMeeting[]> {
  const meetings: CouncilMeeting[] = [];

  const fetches = ([
    [committeeUrl, 'committee'],
    [plenaryUrl, 'plenary'],
  ] as const).map(async ([url, type]) => {
    const res = await log.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      log.warn(`PARDOK ${type} returned ${res.status}`);
      return [];
    }
    const text = await res.text();
    return parsePardokXml(text, type, now, windowMs);
  });

  const results = await Promise.allSettled(fetches);
  for (const r of results) {
    if (r.status === 'fulfilled') {
      meetings.push(...r.value);
    } else {
      log.warn(`PARDOK fetch failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }

  return meetings;
}

// ── Main ingestion factory ──────────────────────────────────────

export function createCouncilMeetingIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestCouncilMeetings(): Promise<void> {
    try {
      const cities = getActiveCities();
      const now = Date.now();
      const windowMs = LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

      for (const city of cities) {
        const cfg = city.dataSources.councilMeetings;
        if (!cfg) continue;

        const allMeetings: CouncilMeeting[] = [];

        // Fetch BVV OParl districts (rate-gated concurrent)
        const gate = createRateGate(DELAY_BETWEEN_DISTRICTS_MS);

        const oparlTargets: OparlTarget[] = (cfg.bvv ?? []).map((d) => ({
          label: d.district,
          firstUrl: `${d.baseUrl}/meetings.asp?body=1`,
          district: d.district,
        }));
        if (cfg.oparlBody) {
          // OParl 1.1 `limit`: 100 a page, so the walk back to today takes a few pages, not dozens
          oparlTargets.push({
            label: city.id,
            firstUrl: `${cfg.oparlBody.meetingsUrl}?limit=100`,
            districtBody: cfg.oparlBody.districtBody,
            webUrlPrefix: cfg.oparlBody.webUrlPrefix,
            maxPages: 15,
          });
        }

        const oparlResults = await Promise.allSettled(
          oparlTargets.map(async (target) => {
            await gate();
            const meetings = await fetchOparlMeetings(target, now, windowMs);
            log.info(`${city.id} ${target.label}: ${meetings.length} meetings`);
            return meetings;
          }),
        );

        for (const r of oparlResults) {
          if (r.status === 'fulfilled') {
            allMeetings.push(...r.value);
          } else {
            log.warn(`${city.id} OParl failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
          }
        }

        if (cfg.muenchenRis) {
          const meetings = await fetchMuenchenRis(
            [cfg.muenchenRis.councilFeedUrl, cfg.muenchenRis.districtFeedUrl],
            now,
            windowMs,
          );
          allMeetings.push(...meetings);
          log.info(`${city.id} RIS: ${meetings.length} meetings`);
        }

        if (cfg.hamburgBuergerschaft) {
          try {
            const meetings = await fetchBuergerschaftCalendar(cfg.hamburgBuergerschaft.calendarUrl, now, windowMs);
            allMeetings.push(...meetings);
            log.info(`${city.id} Bürgerschaft: ${meetings.length} meetings`);
          } catch (err) {
            log.warn(`${city.id} Bürgerschaft failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Fetch PARDOK (parliament)
        if (cfg.parliament) {
          try {
            const meetings = await fetchPardokSchedules(
              cfg.parliament.committeeUrl,
              cfg.parliament.plenaryUrl,
              now,
              windowMs,
            );
            allMeetings.push(...meetings);
            log.info(`${city.id} parliament: ${meetings.length} meetings`);
          } catch (err) {
            log.warn(`${city.id} PARDOK failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Sort by start date, deduplicate by ID
        const seen = new Set<string>();
        const deduplicated = allMeetings
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
          .filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });

        // Don't overwrite good data if all API calls failed
        if (deduplicated.length === 0) {
          log.warn(`${city.id} no council meetings found — keeping existing data`);
          continue;
        }

        cache.set(CK.councilMeetings(city.id), deduplicated, TTL_SECONDS);

        if (db) {
          try {
            await saveCouncilMeetings(db, city.id, deduplicated);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }

        log.info(`${city.id} council meetings: ${deduplicated.length} total`);
      }
    } catch (err) {
      log.error('Council meeting ingestion failed', err);
    }
  };
}
