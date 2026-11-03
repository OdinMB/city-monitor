/**
 * Street counts of citizen-run Telraam sensors from "Berlin zählt Mobilität"
 * (CC BY 4.0), for every city with `dataSources.telraamCounts`. Reads the
 * segment GeoJSON and the monthly hourly CSVs that cover yesterday and the four
 * weeks before, and keeps each segment's day totals with its usual value for
 * that weekday. The files are rebuilt each night (about 02:15 local time).
 * See .context/telraam-counts.md.
 */
import type { TelraamCountsData } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveTelraamCounts } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import {
  addTelraamCsv, buildTelraamCounts, csvGzText, latestCountedDay, localDate, parseTelraamSegments, shiftDate, telraamMonths, type TelraamDays,
} from '../lib/telraam.js';

const log = createLogger('ingest-telraam-counts');

const TIMEOUT_MS = 60_000;
const USER_AGENT = 'CityMonitor/1.0 (+https://citymonitor.app)';
/** 36 hours: past the next two runs (twice a day), so one failed run keeps the counts. */
export const TELRAAM_COUNTS_TTL_SECONDS = 129600;

async function fetchOk(url: string): Promise<Response | null> {
  const res = await log.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res;
}

export function createTelraamCountsIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestTelraamCounts(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.telraamCounts;
      if (!source) continue;
      try {
        const segRes = await fetchOk(`${source.baseUrl}bzm_telraam_segments.geojson`);
        if (!segRes) {
          log.warn(`${city.id}: segment file not found`);
          continue;
        }
        const segments = parseTelraamSegments(await segRes.json(), source.region);
        if (segments.size === 0) {
          log.warn(`${city.id}: no Telraam segment in ${source.region}`);
          continue;
        }

        const today = localDate(new Date(), city.timezone);
        const days: TelraamDays = new Map();
        for (const month of telraamMonths(shiftDate(today, -1))) {
          // A new month's file appears with its first day's counts: missing on the 1st before then
          const res = await fetchOk(`${source.baseUrl}bzm_telraam_${month}.csv.gz`);
          if (!res) continue;
          addTelraamCsv(csvGzText(new Uint8Array(await res.arrayBuffer())), segments, days);
        }

        const date = latestCountedDay(days, today);
        if (!date) {
          log.warn(`${city.id}: no counted day in the Telraam files`);
          continue;
        }
        const data: TelraamCountsData = buildTelraamCounts(days, segments, date);
        cache.set(CK.telraamCounts(city.id), data, TELRAAM_COUNTS_TTL_SECONDS);
        if (db) {
          try {
            await saveTelraamCounts(db, city.id, data);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        log.info(`${city.id}: ${data.segments.length} counted segments on ${date}`);
      } catch (err) {
        log.error(`${city.id} Telraam counts failed`, err);
      }
    }
  };
}
