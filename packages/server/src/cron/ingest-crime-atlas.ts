/**
 * Recorded crime per Bezirksregion from the Kriminalitätsatlas Berlin
 * (Polizei Berlin, CC BY-SA), for every city with `dataSources.crimeAtlas`.
 * One XLSX (~630 KB) holds every year since 2016; the job takes the newest
 * year's cases and rates and puts them on the bundled outlines. The atlas is
 * published once a year (2025 in September 2026); a monthly run picks a new
 * year up within weeks. See .context/crime-atlas.md.
 */
import type { CityConfig, CrimeAtlasSource } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveCrimeAtlas } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { loadAreaOutlines } from '../lib/area-outlines.js';
import { loadWorkbook, sheetToAoa } from '../lib/xlsx.js';
import { buildCrimeAtlas, newestCrimeYear, parseCrimeSheet } from '../lib/crime-atlas.js';

const log = createLogger('ingest-crime-atlas');

const FETCH_TIMEOUT_MS = 60_000;
const USER_AGENT = 'CityMonitor/1.0 (+https://citymonitor.app)';
/**
 * 37.2 days: the longest gap between monthly runs (31 days) × 1.2, so an entry
 * lasts until the next run. Retention keeps the newest row, which the route's
 * DB fallback and cache warming read.
 */
export const CRIME_ATLAS_TTL_SECONDS = 3214080;

export function createCrimeAtlasIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestCrimeAtlas(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.crimeAtlas;
      if (!source) continue;
      try {
        await ingestCityCrimeAtlas(city, source, cache, db);
      } catch (err) {
        log.error(`${city.id} crime atlas failed`, err);
      }
    }
  };
}

async function ingestCityCrimeAtlas(city: CityConfig, source: CrimeAtlasSource, cache: Cache, db: Db | null): Promise<void> {
  const res = await log.fetch(source.xlsxUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    log.warn(`${city.id}: crime atlas XLSX returned ${res.status}`);
    return;
  }
  const wb = await loadWorkbook(await res.arrayBuffer());
  const year = newestCrimeYear(wb.worksheets.map((ws) => ws.name));
  if (year === null) {
    log.warn(`${city.id}: no Fallzahlen_<year> and HZ_<year> sheets in the crime atlas`);
    return;
  }
  const counts = parseCrimeSheet(sheetToAoa(wb.getWorksheet(`Fallzahlen_${year}`)!));
  const rates = parseCrimeSheet(sheetToAoa(wb.getWorksheet(`HZ_${year}`)!));
  const built = buildCrimeAtlas(year, counts, rates, await loadAreaOutlines(source.outlines));
  if (!built || built.data.geojson.features.length === 0) {
    log.warn(`${city.id}: no crime atlas areas for ${year} (missing Berlin row or outlines)`);
    return;
  }
  const { data, unmatched } = built;
  if (unmatched.length > 0) {
    // New LOR keys mean redrawn Bezirksregionen: the outlines need rebuilding
    log.warn(`${city.id}: ${unmatched.length} crime atlas areas have no outline (${unmatched.slice(0, 5).join(', ')})`);
  }

  cache.set(CK.crimeAtlas(city.id), data, CRIME_ATLAS_TTL_SECONDS);
  if (db) {
    try {
      await saveCrimeAtlas(db, city.id, data);
    } catch (err) {
      log.error(`${city.id} DB write failed`, err);
    }
  }
  log.info(`${city.id}: ${data.geojson.features.length} areas, ${data.city.totalCount ?? '?'} offences in ${year}`);
}
