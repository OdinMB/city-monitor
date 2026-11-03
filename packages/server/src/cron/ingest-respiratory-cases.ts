import type { CityConfig, RespiratoryCaseSeries, RespiratoryCases } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveRespiratoryCases } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { computeTrend } from './ingest-wastewater.js';

const log = createLogger('ingest-respiratory-cases');

const RKI = 'https://raw.githubusercontent.com/robert-koch-institut';
/** Lab-confirmed influenza and RSV cases notified under the IfSG, per Meldewoche and Land (CC BY 4.0). */
export const RKI_IFSG_URLS: Record<RespiratoryCaseSeries['name'], string> = {
  Influenza: `${RKI}/Influenzafaelle_in_Deutschland/main/IfSG_Influenzafaelle.tsv`,
  RSV: `${RKI}/Respiratorische_Synzytialvirusfaelle_in_Deutschland/main/IfSG_RSVfaelle.tsv`,
};
const FETCH_TIMEOUT_MS = 60_000; // about 0.7 MB and 0.15 MB in 2026-11
export const RESPIRATORY_CASES_TTL_SECONDS = 604800; // 7 days: the files change once a week
const HISTORY_WEEKS = 12;

/** The influenza file starts with a byte order mark. */
const BOM = String.fromCodePoint(0xfeff);

/** All ages; the files also break cases down by age group. */
const ALL_AGES = '00+';

export interface IfsgWeek {
  cases: number;
  incidence: number;
}

/** One RKI file: the latest Meldewoche in it, and per Land key the all-ages figures by week. */
export interface IfsgFile {
  firstWeek: string;
  latestWeek: string;
  byRegion: Map<string, Map<string, IfsgWeek>>;
}

/**
 * Parses an IfSG case TSV (`Meldewoche, Region, Region_Id, Altersgruppe,
 * Fallzahl, Inzidenz`), finding the columns by header name. Keeps the
 * all-ages rows. Null when the header lacks a column or no week is found.
 */
export function parseIfsgTsv(text: string): IfsgFile | null {
  const lines = (text.startsWith(BOM) ? text.slice(1) : text).split(/\r?\n/);
  const header = (lines[0] ?? '').split('\t');
  const col = (name: string) => header.indexOf(name);
  const [iWeek, iRegion, iAge, iCases, iIncidence] = ['Meldewoche', 'Region_Id', 'Altersgruppe', 'Fallzahl', 'Inzidenz'].map(col);
  if ([iWeek, iRegion, iAge, iCases, iIncidence].some((i) => i! < 0)) return null;

  const byRegion = new Map<string, Map<string, IfsgWeek>>();
  let firstWeek = '';
  let latestWeek = '';
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i]!.split('\t');
    const week = f[iWeek!];
    if (!week || !/^\d{4}-W\d{2}$/.test(week)) continue;
    if (!firstWeek || week < firstWeek) firstWeek = week;
    if (week > latestWeek) latestWeek = week;
    if (f[iAge!] !== ALL_AGES) continue;
    const cases = Number(f[iCases!]);
    if (!Number.isFinite(cases)) continue;
    const incidence = Number(f[iIncidence!]);
    const region = f[iRegion!]!;
    let weeks = byRegion.get(region);
    if (!weeks) byRegion.set(region, (weeks = new Map()));
    weeks.set(week, { cases, incidence: Number.isFinite(incidence) ? incidence : 0 });
  }
  return latestWeek ? { firstWeek, latestWeek, byRegion } : null;
}

/** Monday of an ISO week ("2026-W43" → 2026-10-19), as a UTC date. */
export function isoWeekMonday(week: string): Date {
  const [year, w] = week.split('-W').map(Number) as [number, number];
  // 4 January is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return monday;
}

/** The ISO week label of a UTC date (2026-10-19 → "2026-W43"). */
export function isoWeekLabel(date: Date): string {
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - isoWeekMonday(`${year}-W01`).getTime()) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * One pathogen for one Land, up to `latestWeek`. The influenza file leaves out
 * a Land's weeks without a case, so a missing week counts as zero; the history
 * stops at the file's first week rather than padding before it. Null when the
 * file has no row for the Land at all.
 */
export function buildCaseSeries(
  name: RespiratoryCaseSeries['name'],
  file: IfsgFile,
  regionId: string,
  latestWeek: string,
): RespiratoryCaseSeries | null {
  const weeks = file.byRegion.get(regionId);
  if (!weeks) return null;

  const end = isoWeekMonday(latestWeek);
  const labels: string[] = [];
  for (let i = HISTORY_WEEKS - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i * 7);
    const label = isoWeekLabel(d);
    if (label >= file.firstWeek) labels.push(label);
  }
  const history = labels.map((l) => weeks.get(l)?.cases ?? 0);
  const latest = weeks.get(latestWeek) ?? { cases: 0, incidence: 0 };
  const previousCases = history.length > 1 ? history[history.length - 2]! : 0;

  return {
    name,
    cases: latest.cases,
    incidence: latest.incidence,
    previousCases,
    trend: computeTrend(latest.cases, previousCases),
    history,
  };
}

/**
 * A city's figures from the parsed files: the newest week of either file,
 * and each pathogen with rows for the Land. Null when there is none.
 */
export function buildRespiratoryCases(
  files: Partial<Record<RespiratoryCaseSeries['name'], IfsgFile>>,
  regionId: string,
): RespiratoryCases | null {
  const present = (Object.entries(files) as [RespiratoryCaseSeries['name'], IfsgFile][]);
  if (present.length === 0) return null;
  const week = present.reduce((latest, [, f]) => (f.latestWeek > latest ? f.latestWeek : latest), '');
  const pathogens = present
    .map(([name, file]) => buildCaseSeries(name, file, regionId, week))
    .filter((p) => p !== null);
  if (pathogens.length === 0) return null;
  return { week, weekStart: isoWeekMonday(week).toISOString().slice(0, 10), pathogens };
}

async function fetchIfsg(name: RespiratoryCaseSeries['name']): Promise<IfsgFile | null> {
  try {
    const res = await log.fetch(RKI_IFSG_URLS[name], { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      log.warn(`${name}: RKI returned ${res.status}`);
      return null;
    }
    const file = parseIfsgTsv(await res.text());
    if (!file) log.warn(`${name}: RKI file lacks the expected columns or weeks`);
    return file;
  } catch (err) {
    log.error(`${name}: RKI fetch failed`, err);
    return null;
  }
}

type CasesCity = CityConfig & { dataSources: { respiratoryCases: NonNullable<CityConfig['dataSources']['respiratoryCases']> } };

export function createRespiratoryCasesIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestRespiratoryCases(): Promise<void> {
    const cities = getActiveCities().filter((c): c is CasesCity => c.dataSources.respiratoryCases !== undefined);
    if (cities.length === 0) return;

    // Both files are nationwide: one download each for every city
    const [influenza, rsv] = await Promise.all([fetchIfsg('Influenza'), fetchIfsg('RSV')]);
    const files: Partial<Record<RespiratoryCaseSeries['name'], IfsgFile>> = {};
    if (influenza) files.Influenza = influenza;
    if (rsv) files.RSV = rsv;
    // Both failing leaves every city's cache and DB row as they were
    if (!influenza && !rsv) return;

    for (const city of cities) {
      const data = buildRespiratoryCases(files, city.dataSources.respiratoryCases.regionId);
      if (!data) {
        log.warn(`${city.id}: no IfSG case data for region ${city.dataSources.respiratoryCases.regionId}`);
        continue;
      }

      cache.set(CK.respiratoryCases(city.id), data, RESPIRATORY_CASES_TTL_SECONDS);
      if (db) {
        try {
          await saveRespiratoryCases(db, city.id, data);
        } catch (err) {
          log.error(`${city.id} DB write failed`, err);
        }
      }
      log.info(`${city.id}: ${data.week}, ${data.pathogens.map((p) => `${p.name} ${p.cases}`).join(', ')}`);
    }
  };
}
