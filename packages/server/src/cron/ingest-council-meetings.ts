import type { CouncilMeeting } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveCouncilMeetings } from '../db/writes.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { getActiveCities } from '../config/index.js';
import { XMLParser } from 'fast-xml-parser';

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
  location?: { description?: string; streetAddress?: string; room?: string };
  agendaItem?: Array<{ number?: string; name?: string; public?: boolean }>;
  web?: string;
}

interface OparlResponse {
  data?: OparlMeeting[];
  links?: { next?: string };
}

function extractCommittee(name: string): string {
  // OParl names are like "77. Sitzung in der IX. Wahlperiode des Ausschusses ..."
  // Try to extract the committee name after "des/der"
  const match = name.match(/(?:des|der)\s+(.+)$/i);
  return match ? match[1] : name;
}

function buildLocation(loc: OparlMeeting['location']): string | undefined {
  if (!loc) return undefined;
  const parts = [loc.room, loc.streetAddress ?? loc.description].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

async function fetchOparlMeetings(
  baseUrl: string,
  district: string,
  now: number,
  windowMs: number,
): Promise<CouncilMeeting[]> {
  const meetings: CouncilMeeting[] = [];
  let url: string | undefined = `${baseUrl}/meetings.asp?body=1`;
  let pages = 0;

  while (url && pages < 10) {
    pages++;
    const res = await log.fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      log.warn(`${district} OParl returned ${res.status}`);
      break;
    }

    let json: OparlResponse;
    try {
      json = await res.json() as OparlResponse;
    } catch {
      log.warn(`${district} OParl returned invalid JSON`);
      break;
    }

    if (!json.data || json.data.length === 0) break;

    // OParl returns meetings sorted newest-first; check if any are in our window
    let anyInFuture = false;
    for (const m of json.data) {
      if (!m.start) continue;

      const t = new Date(m.start).getTime();
      if (t < now) continue; // past meeting — stop if all are past
      anyInFuture = true;

      if (t > now + windowMs) continue; // too far in the future

      // Skip nichtöffentlich (non-public) sessions
      if (m.name && /nichtöffentlich/i.test(m.name)) continue;

      meetings.push({
        id: m.id,
        source: 'bvv',
        district,
        committee: extractCommittee(m.name ?? district),
        start: m.start,
        end: m.end,
        location: buildLocation(m.location),
        agendaItems: m.agendaItem?.map((a) => ({
          number: a.number ?? '',
          name: a.name ?? '',
          public: a.public ?? true,
        })),
        webUrl: m.web,
      });
    }

    // If no meetings are in the future, remaining pages are even older
    if (!anyInFuture) break;

    url = json.links?.next;
  }

  return meetings;
}

// ── PARDOK XML ingestion ────────────────────────────────────────

/** Determine CET (+01:00) or CEST (+02:00) offset for a given date in Europe/Berlin */
function berlinUtcOffset(dateStr: string): string {
  // Parse as UTC first to get a Date object for DST detection
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', timeZoneName: 'short' }).formatToParts(d);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value;
  return tz === 'CEST' ? '+02:00' : '+01:00';
}

interface PardokRow {
  Termin_ID: string;
  committee_name: string;
  wahlperiode: string;
  date_time: string;
  date_time_end?: string;
  title: string;
}

function parsePardokXml(xmlText: string, type: 'committee' | 'plenary', now: number, windowMs: number): CouncilMeeting[] {
  const parsed = xmlParser.parse(xmlText);
  const rows: PardokRow[] = [];

  // XML structure: resultset.row[].field[]
  const rawRows = parsed?.resultset?.row;
  if (!Array.isArray(rawRows)) return [];

  for (const row of rawRows) {
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

  for (const [url, type] of [[committeeUrl, 'committee'], [plenaryUrl, 'plenary']] as const) {
    try {
      const res = await log.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        log.warn(`PARDOK ${type} returned ${res.status}`);
        continue;
      }
      const text = await res.text();
      meetings.push(...parsePardokXml(text, type, now, windowMs));
    } catch (err) {
      log.warn(`PARDOK ${type} fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return meetings;
}

// ── Main ingestion factory ──────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

        // Fetch BVV OParl districts
        for (const district of cfg.bvv) {
          try {
            const meetings = await fetchOparlMeetings(district.baseUrl, district.district, now, windowMs);
            allMeetings.push(...meetings);
            log.info(`${city.id} ${district.district}: ${meetings.length} meetings`);
          } catch (err) {
            log.warn(`${city.id} ${district.district} OParl failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          await delay(DELAY_BETWEEN_DISTRICTS_MS);
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
