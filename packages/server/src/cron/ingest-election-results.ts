/**
 * The latest election's result per area, for every city with
 * `dataSources.electionResults`: Berlin's Abgeordnetenhaus 2026 per Wahlkreis,
 * Hamburg's Bürgerschaft 2025 per Stadtteil, München's Stadtrat 2026 per
 * Stadtbezirk. Each is a final result in an official file that changes only
 * with a correction, so the job runs monthly. The results are joined to the
 * outlines in packages/server/data/ for the political map's Election view.
 * See .context/election-results.md.
 */
import type { ElectionFeatureProps, ElectionResults, ElectionResultSource } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveElectionResults } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { readSheet, readSheets } from '../lib/xlsx.js';
import { listZipEntries, openZipEntry } from '../lib/zip.js';
import { loadAreaOutlines, type AreaOutline } from '../lib/area-outlines.js';
import {
  AREA_LEVEL, BERLIN_AGH_SHEET, MUENCHEN_STADTBEZIRK_CSV,
  buildElectionResults, parseBerlinAghSheet, parseHamburgStadtteilSheet, parseMuenchenStadtratCsv,
  type RawElection,
} from '../lib/election-parsers.js';

const log = createLogger('ingest-election-results');

const DOWNLOAD_TIMEOUT_MS = 120_000;
const USER_AGENT = 'CityMonitor/1.0 (+https://citymonitor.app)';
/**
 * 37.2 days: the longest gap between monthly runs (31 days) × 1.2, so an entry
 * lasts until the next run. Retention keeps the newest row for the routes'
 * DB fallback and cache warming.
 */
export const ELECTION_RESULTS_TTL_SECONDS = 3214080;

/** The results and the area polygons they colour, as stored in one snapshot. */
export interface ElectionSnapshot {
  results: ElectionResults;
  geojson: {
    type: 'FeatureCollection';
    features: Array<{ type: 'Feature'; geometry: unknown; properties: ElectionFeatureProps }>;
  };
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

/** The source's file read by its provider's parser. */
export async function parseElectionFile(
  source: ElectionResultSource,
  bytes: ArrayBuffer,
  outlines: ReadonlyMap<string, AreaOutline>,
): Promise<RawElection> {
  switch (source.provider) {
    case 'berlin-agh-xlsx': {
      const sheet = await readSheet(bytes, BERLIN_AGH_SHEET);
      if (!sheet) throw new Error(`no sheet ${BERLIN_AGH_SHEET}`);
      return parseBerlinAghSheet(sheet);
    }
    case 'hamburg-stadtteile-xlsx': {
      const sheet = [...(await readSheets(bytes, (_name, index) => index === 0)).sheets.values()][0];
      if (!sheet) throw new Error('empty workbook');
      const parsed = parseHamburgStadtteilSheet(sheet, outlines);
      if (parsed.unmatched.length > 0) log.warn(`hamburg: no outline for ${parsed.unmatched.join(', ')}`);
      return parsed;
    }
    case 'muenchen-stadtrat-zip': {
      const zip = Buffer.from(new Uint8Array(bytes));
      const entry = listZipEntries(zip).find((e) => e.name.endsWith(MUENCHEN_STADTBEZIRK_CSV));
      if (!entry) throw new Error(`no ${MUENCHEN_STADTBEZIRK_CSV} in the archive`);
      return parseMuenchenStadtratCsv(await readStream(openZipEntry(zip, entry)), outlines);
    }
  }
}

/**
 * One feature per outline an area covers (a Hamburg group covers several), with
 * the area's ID, name and strongest party. Areas without an outline are left
 * off the map; the result still lists them.
 */
export function electionGeojson(results: ElectionResults, outlines: ReadonlyMap<string, AreaOutline>): ElectionSnapshot['geojson'] {
  const features: ElectionSnapshot['geojson']['features'] = [];
  for (const area of results.areas) {
    const leaderPct = area.shares.find((s) => s.party === area.leader)?.pct ?? null;
    for (const outlineId of area.id.split('+')) {
      const outline = outlines.get(outlineId);
      if (!outline) continue;
      features.push({
        type: 'Feature',
        geometry: outline.geometry,
        properties: { id: area.id, name: area.name, leader: area.leader, leaderPct },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function createElectionResultsIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestElectionResults(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.electionResults;
      if (!source) continue;
      try {
        const res = await log.fetch(source.url, {
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
          headers: { 'User-Agent': USER_AGENT },
        });
        if (!res.ok) {
          log.warn(`${city.id}: election result returned ${res.status}`);
          continue;
        }
        const outlines = await loadAreaOutlines(source.outlines);
        const raw = await parseElectionFile(source, await res.arrayBuffer(), outlines);
        const results = buildElectionResults(raw, source, AREA_LEVEL[source.provider]);
        const geojson = electionGeojson(results, outlines);
        const unmapped = results.areas.filter((a) => !a.id.split('+').every((id) => outlines.has(id)));
        if (unmapped.length > 0) log.warn(`${city.id}: no outline for ${unmapped.map((a) => a.name).join(', ')}`);

        cache.set(CK.electionResults(city.id), results, ELECTION_RESULTS_TTL_SECONDS);
        cache.set(CK.electionGeojson(city.id), geojson, ELECTION_RESULTS_TTL_SECONDS);
        if (db) {
          try {
            await saveElectionResults(db, city.id, { results, geojson });
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        log.info(`${city.id}: ${source.election} ${source.date}, ${results.areas.length} areas, strongest ${results.total.leader}`);
      } catch (err) {
        // A changed file keeps the previous result in the cache and database
        log.error(`${city.id} election results failed`, err);
      }
    }
  };
}
