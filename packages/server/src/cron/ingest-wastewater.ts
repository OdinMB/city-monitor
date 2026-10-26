import type { WastewaterPathogen, WastewaterSummary } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveWastewater } from '../db/writes.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-wastewater');

const CSV_URL = 'https://data.lageso.de/infektionsschutz/opendata/abwassermonitoring/BEWAC_abwassermonitoring_berlin.csv';
const AMELAG_TSV_URL = 'https://raw.githubusercontent.com/robert-koch-institut/Abwassersurveillance_AMELAG/main/amelag_einzelstandorte.tsv';
const FETCH_TIMEOUT_MS = 30_000;
const AMELAG_FETCH_TIMEOUT_MS = 60_000;
const WASTEWATER_TTL_SECONDS = 604800; // 7 days
const CACHE_KEY = CK.wastewaterSummary('berlin');

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

function buildSummary(rows: CsvRow[]): WastewaterSummary | null {
  if (rows.length === 0) return null;

  // Get unique dates sorted descending
  const dates = [...new Set(rows.map((r) => r.date))].sort().reverse();
  const latestDate = dates[0];
  const previousDate = dates[1] ?? null;

  const latestRows = rows.filter((r) => r.date === latestDate);
  const previousRows = previousDate ? rows.filter((r) => r.date === previousDate) : [];

  // Unique plants in latest sample
  const plants = new Set(latestRows.map((r) => r.plant));

  // Unique pathogens in latest sample only
  const pathogenNames = [...new Set(latestRows.map((r) => r.pathogen))].sort();

  // History dates: last 12 dates (descending), then reversed to oldest-first
  const historyDates = dates.slice(0, HISTORY_LENGTH).reverse();

  const avg = (vals: number[]) => vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  // Precompute per-pathogen max non-zero value across ALL dates
  const maxNonZero = new Map<string, number>();
  for (const name of pathogenNames) {
    let max = 0;
    for (const date of dates) {
      const values = rows.filter((r) => r.date === date && r.pathogen === name).map((r) => r.value);
      const a = avg(values);
      if (a > max) max = a;
    }
    maxNonZero.set(name, max);
  }

  const pathogens: WastewaterPathogen[] = pathogenNames.map((name) => {
    const latestValues = latestRows.filter((r) => r.pathogen === name).map((r) => r.value);
    const previousValues = previousRows.filter((r) => r.pathogen === name).map((r) => r.value);

    const value = avg(latestValues);
    const previousValue = avg(previousValues);

    // Build history: avg per pathogen per date, oldest-first
    const history = historyDates.map((date) => {
      const values = rows.filter((r) => r.date === date && r.pathogen === name).map((r) => r.value);
      return avg(values);
    });

    return {
      name,
      value,
      previousValue,
      trend: previousDate ? computeTrend(value, previousValue) : 'stable',
      level: computeLevel(value, maxNonZero.get(name) ?? 0),
      history,
    };
  });

  return {
    sampleDate: latestDate,
    pathogens,
    plantCount: plants.size,
  };
}

// --- AMELAG stream parsing ---

// Column indices in amelag_einzelstandorte.tsv (0-based):
// standort(0) bundesland(1) datum(2) viruslast(3) viruslast_normalisiert(4)
// vorhersage(5) obere_schranke(6) untere_schranke(7) einwohner(8)
// laborwechsel(9) typ(10) unter_bg(11)
const AMELAG_COL_BUNDESLAND = 1;
const AMELAG_COL_DATUM = 2;
const AMELAG_COL_VIRUSLAST = 3;
const AMELAG_COL_TYP = 10;
const AMELAG_COL_STANDORT = 0;

interface AmelagRow {
  date: string;
  plant: string;
  value: number;
}

/**
 * Stream-parse the AMELAG TSV response, keeping only Berlin SARS-CoV-2 rows.
 * Processes line-by-line to avoid loading the full ~27 MB file into memory.
 */
export async function parseAmelagBerlinCovid(response: Response): Promise<AmelagRow[]> {
  const rows: AmelagRow[] = [];
  const reader = response.body?.getReader();
  if (!reader) return rows;

  const decoder = new TextDecoder();
  let buffer = '';
  let headerSkipped = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    // Keep last partial line in buffer
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!headerSkipped) {
        headerSkipped = true;
        continue;
      }
      if (!line.trim()) continue;

      const fields = line.split('\t');
      if (fields.length <= AMELAG_COL_TYP) continue;

      const bundesland = fields[AMELAG_COL_BUNDESLAND];
      const typ = fields[AMELAG_COL_TYP];
      if (bundesland !== 'BE' || typ !== 'SARS-CoV-2') continue;

      const date = fields[AMELAG_COL_DATUM];
      const plant = fields[AMELAG_COL_STANDORT];
      const value = parseFloat(fields[AMELAG_COL_VIRUSLAST]);
      if (!date || isNaN(value)) continue;

      rows.push({ date, plant, value });
    }
  }

  // Process remaining buffer
  if (buffer.trim() && headerSkipped) {
    const fields = buffer.split('\t');
    if (fields.length > AMELAG_COL_TYP) {
      const bundesland = fields[AMELAG_COL_BUNDESLAND];
      const typ = fields[AMELAG_COL_TYP];
      if (bundesland === 'BE' && typ === 'SARS-CoV-2') {
        const date = fields[AMELAG_COL_DATUM];
        const plant = fields[AMELAG_COL_STANDORT];
        const value = parseFloat(fields[AMELAG_COL_VIRUSLAST]);
        if (date && !isNaN(value)) {
          rows.push({ date, plant, value });
        }
      }
    }
  }

  return rows;
}

/**
 * Build a WastewaterPathogen for SARS-CoV-2 from AMELAG rows.
 * Reuses the same trend/level/history logic as the Lageso pathogens.
 */
export function buildCovidPathogen(rows: AmelagRow[]): (WastewaterPathogen & { sampleDate: string }) | null {
  if (rows.length === 0) return null;

  const avg = (vals: number[]) => vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  const dates = [...new Set(rows.map((r) => r.date))].sort().reverse();
  const latestDate = dates[0];
  const previousDate = dates[1] ?? null;

  const latestValues = rows.filter((r) => r.date === latestDate).map((r) => r.value);
  const previousValues = previousDate
    ? rows.filter((r) => r.date === previousDate).map((r) => r.value)
    : [];

  const value = avg(latestValues);
  const previousValue = avg(previousValues);

  // Max non-zero across all dates for level computation
  let maxNonZero = 0;
  for (const date of dates) {
    const a = avg(rows.filter((r) => r.date === date).map((r) => r.value));
    if (a > maxNonZero) maxNonZero = a;
  }

  const historyDates = dates.slice(0, HISTORY_LENGTH).reverse();
  const history = historyDates.map((date) => {
    return avg(rows.filter((r) => r.date === date).map((r) => r.value));
  });

  return {
    name: 'SARS-CoV-2',
    value,
    previousValue,
    trend: previousDate ? computeTrend(value, previousValue) : 'stable',
    level: computeLevel(value, maxNonZero),
    history,
    sampleDate: latestDate,
  };
}

export function createWastewaterIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestWastewater(): Promise<void> {
    // Lageso and the AMELAG BE filter cover Berlin only: nothing to fetch unless Berlin is active.
    if (!getCityConfig('berlin')) return;

    try {
      const res = await log.fetch(CSV_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        log.warn(`CSV fetch returned ${res.status}`);
        return;
      }

      const text = await res.text();
      const rows = parseCsvRows(text);
      const summary = buildSummary(rows);

      if (!summary) {
        log.warn('No valid wastewater data in CSV');
        return;
      }

      // Fetch AMELAG SARS-CoV-2 data (non-blocking — Lageso data is cached even if AMELAG fails)
      const covidPathogen = await fetchAmelagCovid(summary.sampleDate);
      if (covidPathogen) {
        summary.pathogens.push(covidPathogen);
      }

      cache.set(CACHE_KEY, summary, WASTEWATER_TTL_SECONDS);

      if (db) {
        try {
          await saveWastewater(db, 'berlin', summary);
        } catch (err) {
          log.error('DB write failed', err);
        }
      }

      log.info(`${summary.pathogens.length} pathogens, ${summary.plantCount} plants, sample date ${summary.sampleDate}`);
    } catch (err) {
      log.error('wastewater ingestion failed', err);
    }
  };
}

async function fetchAmelagCovid(lagesoDate: string): Promise<WastewaterPathogen | null> {
  try {
    const res = await log.fetch(AMELAG_TSV_URL, { signal: AbortSignal.timeout(AMELAG_FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      log.warn(`AMELAG TSV fetch returned ${res.status}`);
      return null;
    }

    const rows = await parseAmelagBerlinCovid(res);
    const pathogen = buildCovidPathogen(rows);
    if (!pathogen) {
      log.warn('No SARS-CoV-2 data found in AMELAG for Berlin');
      return null;
    }

    log.info(`AMELAG SARS-CoV-2: ${pathogen.value.toFixed(0)} gc/L, sample ${pathogen.sampleDate}`);

    // Only include per-pathogen sampleDate if it differs from the Lageso date
    if (pathogen.sampleDate === lagesoDate) {
      const { sampleDate: _, ...rest } = pathogen;
      return rest;
    }
    return pathogen;
  } catch (err) {
    log.error('AMELAG fetch failed, continuing without SARS-CoV-2', err);
    return null;
  }
}
