import type { CityConfig, WastewaterPathogen, WastewaterSummary } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveWastewater } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-wastewater');

export const AMELAG_TSV_URL = 'https://raw.githubusercontent.com/robert-koch-institut/Abwassersurveillance_AMELAG/main/amelag_einzelstandorte.tsv';
const FETCH_TIMEOUT_MS = 30_000;
// The nationwide file was 56 MB on 2026-11-02 and grows weekly
const AMELAG_FETCH_TIMEOUT_MS = 120_000;
const WASTEWATER_TTL_SECONDS = 604800; // 7 days

const RISING_THRESHOLD = 1.5;
const FALLING_THRESHOLD = 0.67;

interface CsvRow {
  date: string;
  plant: string;
  pathogen: string;
  value: number;
}

function parseGermanDecimal(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

function parseCsvRows(text: string): CsvRow[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(';').map((f) => f.replace(/^"|"$/g, ''));
    if (fields.length < 12) continue;

    const date = fields[1];
    const plant = fields[4];
    const pathogen = fields[9];
    const value = parseGermanDecimal(fields[11]);

    if (!date || !pathogen || isNaN(value)) continue;
    rows.push({ date, plant, pathogen, value });
  }
  return rows;
}

export function computeTrend(current: number, previous: number): WastewaterPathogen['trend'] {
  if (previous === 0 && current === 0) return 'stable';
  if (previous === 0 && current > 0) return 'new';
  if (current === 0 && previous > 0) return 'gone';

  const ratio = current / previous;
  if (ratio > RISING_THRESHOLD) return 'rising';
  if (ratio < FALLING_THRESHOLD) return 'falling';
  return 'stable';
}

const HISTORY_LENGTH = 12;

export function computeLevel(value: number, maxNonZero: number): WastewaterPathogen['level'] {
  if (value === 0) return 'none';
  if (maxNonZero === 0) return 'none';
  const ratio = value / maxNonZero;
  if (ratio <= 0.25) return 'low';
  if (ratio <= 0.5) return 'moderate';
  return 'high';
}

/**
 * Berlin's flu and RSV from the LAGeSo CSV, grouped by calendar week exactly
 * like the AMELAG plants (`buildAmelagSummary`): LAGeSo samples Influenza A on
 * Wednesdays and Sundays but B and RSV on Wednesdays only, so grouping by
 * sample date would drop B and RSV whenever a Sunday is the newest date. The
 * plants count equally, as LAGeSo gives no population per plant.
 */
function buildSummary(rows: CsvRow[]): WastewaterSummary | null {
  return buildAmelagSummary(rows.map((r) => ({ site: r.plant, date: r.date, pathogen: r.pathogen, value: r.value, population: 1 })));
}

// --- RKI AMELAG (amelag_einzelstandorte.tsv) ---

/**
 * AMELAG `typ` → the tile's pathogen name. The combined RSV figure is spelt
 * `RSV A+B` at some plants and `RSV A/B` at others; the split RSV A / RSV B
 * and the combined Influenza A+B are left out, as the tile has no slot for them.
 */
const AMELAG_PATHOGENS: Readonly<Record<string, string>> = {
  'Influenza A': 'Influenza A',
  'Influenza B': 'Influenza B',
  'RSV A+B': 'RSV',
  'RSV A/B': 'RSV',
  'SARS-CoV-2': 'SARS-CoV-2',
};

/** The tile's order, the same as Berlin's (LAGeSo's three alphabetically, then SARS-CoV-2). */
const AMELAG_PATHOGEN_ORDER = ['Influenza A', 'Influenza B', 'RSV', 'SARS-CoV-2'];

/** One measured sample of one plant. */
export interface AmelagRow {
  site: string;
  date: string;
  pathogen: string;
  /** Gene copies per litre (`viruslast`); 0 when below the detection limit (`unter_bg` = ja). */
  value: number;
  /** People the plant serves (`einwohner`), the weight in a city's mean. */
  population: number;
}

const AMELAG_COLUMNS = ['standort', 'datum', 'viruslast', 'einwohner', 'typ', 'unter_bg'] as const;

/**
 * Stream-parse the AMELAG TSV, keeping the measured samples of the given
 * plants (`standort`) and of the pathogens the tile shows. Line by line, so
 * the nationwide file (tens of MB) is never held in memory at once.
 *
 * The file has one row per plant, pathogen and day; days without a sample
 * have `viruslast` NA and are dropped. A sample below the detection limit
 * carries the limit as its `viruslast` (`unter_bg` = ja) and is counted as 0,
 * so a pathogen that is absent shows as "none" rather than as the lab's limit.
 */
export async function parseAmelagSites(response: Response, sites: ReadonlySet<string>): Promise<AmelagRow[]> {
  const rows: AmelagRow[] = [];
  const reader = response.body?.getReader();
  if (!reader) return rows;

  const decoder = new TextDecoder();
  let buffer = '';
  let col: Record<(typeof AMELAG_COLUMNS)[number], number> | null = null;

  const take = (line: string) => {
    if (!line.trim()) return;
    const fields = line.replace(/\r$/, '').split('\t');
    if (!col) {
      const header = Object.fromEntries(AMELAG_COLUMNS.map((name) => [name, fields.indexOf(name)]));
      if (Object.values(header).some((i) => i < 0)) throw new Error(`AMELAG header lacks a column: ${fields.join(',')}`);
      col = header as Record<(typeof AMELAG_COLUMNS)[number], number>;
      return;
    }
    if (!sites.has(fields[col.standort]!)) return;
    const pathogen = AMELAG_PATHOGENS[fields[col.typ]!];
    if (!pathogen) return;
    const viruslast = parseFloat(fields[col.viruslast]!);
    const date = fields[col.datum];
    if (!date || isNaN(viruslast)) return;
    rows.push({
      site: fields[col.standort]!,
      date,
      pathogen,
      value: fields[col.unter_bg] === 'ja' ? 0 : viruslast,
      population: parseFloat(fields[col.einwohner]!) || 0,
    });
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last, partial line for the next chunk
    buffer = lines.pop() ?? '';
    for (const line of lines) take(line);
  }
  take(buffer + decoder.decode());

  return rows;
}

/** Monday of the ISO week of a YYYY-MM-DD date. */
function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

interface AmelagWeek {
  value: number;
  /** The week's newest sample date. */
  sampleDate: string;
  plants: number;
}

/**
 * One value per calendar week, as the tile's sparkline expects (entries 7 days
 * apart): each plant's samples of the week averaged (plants sample two or three
 * times a week), then the plants averaged weighted by the people each serves.
 * Weeks without any sample are left out, so a seasonal pause shortens the
 * history rather than showing zeros.
 */
function amelagWeeks(rows: AmelagRow[]): AmelagWeek[] {
  const byWeek = new Map<string, Map<string, { sum: number; n: number; population: number; latest: string }>>();
  for (const r of rows) {
    const week = weekOf(r.date);
    let plants = byWeek.get(week);
    if (!plants) byWeek.set(week, (plants = new Map()));
    const p = plants.get(r.site) ?? { sum: 0, n: 0, population: r.population, latest: r.date };
    p.sum += r.value;
    p.n += 1;
    if (r.date > p.latest) p.latest = r.date;
    plants.set(r.site, p);
  }

  return [...byWeek.keys()].sort().map((week) => {
    const plants = [...byWeek.get(week)!.values()];
    const totalPopulation = plants.reduce((s, p) => s + p.population, 0);
    const value = totalPopulation > 0
      ? plants.reduce((s, p) => s + (p.sum / p.n) * p.population, 0) / totalPopulation
      : plants.reduce((s, p) => s + p.sum / p.n, 0) / plants.length;
    return {
      value,
      sampleDate: plants.reduce((latest, p) => (p.latest > latest ? p.latest : latest), ''),
      plants: plants.length,
    };
  });
}

/**
 * One pathogen from the AMELAG samples of a city's plants: the latest week's
 * value, the week before for the trend, the level against the highest week on
 * record and a 12-week history. Null when no sample of `name` is among `rows`.
 */
export function buildAmelagPathogen(
  rows: AmelagRow[],
  name: string,
): (WastewaterPathogen & { sampleDate: string; plantCount: number }) | null {
  const weeks = amelagWeeks(rows.filter((r) => r.pathogen === name));
  if (weeks.length === 0) return null;

  const latest = weeks[weeks.length - 1]!;
  const previous = weeks.length > 1 ? weeks[weeks.length - 2]! : null;
  const maxNonZero = Math.max(...weeks.map((w) => w.value));

  return {
    name,
    value: latest.value,
    previousValue: previous?.value ?? 0,
    trend: previous ? computeTrend(latest.value, previous.value) : 'stable',
    level: computeLevel(latest.value, maxNonZero),
    history: weeks.slice(-HISTORY_LENGTH).map((w) => w.value),
    sampleDate: latest.sampleDate,
    plantCount: latest.plants,
  };
}

/**
 * A city's tile from AMELAG alone (`provider: 'amelag'`): every pathogen with
 * samples, dated by the newest sample. A pathogen sampled earlier than that
 * keeps its own `sampleDate`.
 */
export function buildAmelagSummary(rows: AmelagRow[]): WastewaterSummary | null {
  const built = AMELAG_PATHOGEN_ORDER
    .map((name) => buildAmelagPathogen(rows, name))
    .filter((p) => p !== null);
  if (built.length === 0) return null;

  const sampleDate = built.reduce((latest, p) => (p.sampleDate > latest ? p.sampleDate : latest), '');
  return {
    sampleDate,
    plantCount: Math.max(...built.map((p) => p.plantCount)),
    pathogens: built.map(({ plantCount: _, sampleDate: date, ...p }) => (date === sampleDate ? p : { ...p, sampleDate: date })),
  };
}

/** Berlin (`provider: 'lageso'`): LAGeSo's flu and RSV, with SARS-CoV-2 from AMELAG when it has any. */
async function lagesoSummary(csvUrl: string, amelagRows: AmelagRow[]): Promise<WastewaterSummary | null> {
  const res = await log.fetch(csvUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    log.warn(`LAGeSo CSV fetch returned ${res.status}`);
    return null;
  }
  const summary = buildSummary(parseCsvRows(await res.text()));
  if (!summary) return null;

  const covid = buildAmelagPathogen(amelagRows, 'SARS-CoV-2');
  if (covid) {
    const { plantCount: _, sampleDate, ...pathogen } = covid;
    // Only include the per-pathogen date when it differs from LAGeSo's
    summary.pathogens.push(sampleDate === summary.sampleDate ? pathogen : { ...pathogen, sampleDate });
  } else {
    log.warn('No SARS-CoV-2 samples in AMELAG for the configured plants');
  }
  return summary;
}

/** The AMELAG samples of these plants, or null when the file could not be read. */
async function fetchAmelag(sites: ReadonlySet<string>): Promise<AmelagRow[] | null> {
  try {
    const res = await log.fetch(AMELAG_TSV_URL, { signal: AbortSignal.timeout(AMELAG_FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      log.warn(`AMELAG TSV fetch returned ${res.status}`);
      return null;
    }
    return await parseAmelagSites(res, sites);
  } catch (err) {
    log.error('AMELAG fetch failed', err);
    return null;
  }
}

type WastewaterCity = CityConfig & { dataSources: { wastewater: NonNullable<CityConfig['dataSources']['wastewater']> } };

export function createWastewaterIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestWastewater(): Promise<void> {
    const cities = getActiveCities().filter((c): c is WastewaterCity => c.dataSources.wastewater !== undefined);
    if (cities.length === 0) return;

    // One download for every city: the file is nationwide
    const amelagRows = await fetchAmelag(new Set(cities.flatMap((c) => c.dataSources.wastewater.sites)));

    for (const city of cities) {
      const source = city.dataSources.wastewater;
      const sites = new Set(source.sites);
      const rows = (amelagRows ?? []).filter((r) => sites.has(r.site));

      try {
        // AMELAG failing leaves an AMELAG city's tile as it was; Berlin keeps LAGeSo's three
        const summary = source.provider === 'lageso'
          ? await lagesoSummary(source.csvUrl, rows)
          : buildAmelagSummary(rows);
        if (!summary) {
          log.warn(`${city.id}: no wastewater data`);
          continue;
        }

        cache.set(CK.wastewaterSummary(city.id), summary, WASTEWATER_TTL_SECONDS);

        if (db) {
          try {
            await saveWastewater(db, city.id, summary);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }

        log.info(`${city.id}: ${summary.pathogens.length} pathogens, ${summary.plantCount} plants, sample date ${summary.sampleDate}`);
      } catch (err) {
        log.error(`${city.id} wastewater ingestion failed`, err);
      }
    }
  };
}
