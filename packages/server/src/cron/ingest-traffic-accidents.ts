/**
 * Road accidents with personal injury from the Unfallatlas of the Statistische
 * Ämter des Bundes und der Länder (dl-de/by-2.0), for every city with
 * `dataSources.trafficAccidents`. The newest year's national CSV (12.6 MB
 * zipped, 42 MB unpacked) is downloaded once per run and streamed, keeping each
 * city's rows by municipality key. A new year appears each July; the monthly
 * run picks it up from the index. See .context/traffic-accidents.md.
 */
import type { TrafficAccidentData } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveTrafficAccidents } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { listZipEntries, openZipEntry } from '../lib/zip.js';
import { agsPrefix, newestUnfallatlasCsv, parseUnfallatlasCsv, streamLines, UNFALLATLAS_INDEX_URL } from '../lib/unfallatlas.js';

const log = createLogger('ingest-traffic-accidents');

const INDEX_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const USER_AGENT = 'CityMonitor/1.0 (+https://citymonitor.app)';
/**
 * 37.2 days: the longest gap between monthly runs (31 days) × 1.2, so an entry
 * lasts until the next run. Retention keeps the newest row, which the route's
 * DB fallback and cache warming read.
 */
export const TRAFFIC_ACCIDENTS_TTL_SECONDS = 3214080;

export function createTrafficAccidentIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestTrafficAccidents(): Promise<void> {
    const cities = getActiveCities().flatMap((city) => {
      const source = city.dataSources.trafficAccidents;
      return source ? [{ cityId: city.id, prefix: agsPrefix(source.ags) }] : [];
    });
    if (cities.length === 0) return;

    try {
      const indexRes = await log.fetch(UNFALLATLAS_INDEX_URL, {
        signal: AbortSignal.timeout(INDEX_TIMEOUT_MS),
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (!indexRes.ok) {
        log.warn(`Unfallatlas index returned ${indexRes.status}`);
        return;
      }
      const file = newestUnfallatlasCsv(await indexRes.json());
      if (!file) {
        log.warn('Unfallatlas index lists no CSV archive');
        return;
      }

      const zipRes = await log.fetch(file.url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!zipRes.ok) {
        log.warn(`Unfallatlas ${file.year} archive returned ${zipRes.status}`);
        return;
      }
      const zip = Buffer.from(await zipRes.arrayBuffer());
      const entry = listZipEntries(zip).find((e) => e.name.toLowerCase().endsWith('.csv'));
      if (!entry) {
        log.warn(`Unfallatlas ${file.year} archive holds no CSV`);
        return;
      }

      const { byCity, skipped } = await parseUnfallatlasCsv(streamLines(openZipEntry(zip, entry)), cities);
      if (skipped > 0) log.warn(`${skipped} rows in the cities left out for an impossible value`);

      for (const { cityId } of cities) {
        const accidents = byCity.get(cityId) ?? [];
        if (accidents.length === 0) {
          // No rows means a changed key or format, not a year without accidents: keep the last data
          log.warn(`${cityId}: no accidents in the Unfallatlas ${file.year}`);
          continue;
        }
        const data: TrafficAccidentData = { year: file.year, accidents, published: file.published };
        cache.set(CK.trafficAccidents(cityId), data, TRAFFIC_ACCIDENTS_TTL_SECONDS);
        if (db) {
          try {
            await saveTrafficAccidents(db, cityId, data);
          } catch (err) {
            log.error(`${cityId} DB write failed`, err);
          }
        }
        log.info(`${cityId}: ${accidents.length} accidents in ${file.year}`);
      }
    } catch (err) {
      log.error('traffic accidents failed', err);
    }
  };
}
