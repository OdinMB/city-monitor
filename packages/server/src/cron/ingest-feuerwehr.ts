import type { FeuerwehrSummary, FeuerwehrMonthData } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveFeuerwehr } from '../db/writes.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-feuerwehr');

const CSV_URL = 'https://raw.githubusercontent.com/Berliner-Feuerwehr/BF-Open-Data/main/Datasets/Daily_Data/BFw_mission_data_monthly.csv';
const FETCH_TIMEOUT_MS = 30_000;
const CACHE_KEY = CK.feuerwehr('berlin');
const TTL_SECONDS = 86400; // 1 day

interface CsvRow {
  reportMonth: string;
  missionCountAll: number;
  missionCountEms: number;
  missionCountFire: number;
  missionCountTechnicalRescue: number;
  responseTimeEmsCriticalMedian: number;
  responseTimeFirePumpMedian: number;
}

function parseRow(fields: string[]): CsvRow | null {
  const reportMonth = fields[0]?.trim();
  if (!reportMonth || !/^\d{4}-\d{2}$/.test(reportMonth)) return null;

  const num = (i: number) => {
    const v = parseFloat(fields[i]);
    return isNaN(v) ? 0 : v;
  };

  return {
    reportMonth,
    missionCountAll: num(1),
    missionCountEms: num(2),
    missionCountFire: num(5),
    missionCountTechnicalRescue: num(6),
    responseTimeEmsCriticalMedian: num(13),
    responseTimeFirePumpMedian: num(19),
  };
}

/**
 * Parse the monthly mission CSV and build a FeuerwehrSummary.
 * @param text Raw CSV text
 * @param currentYearMonth The current YYYY-MM (e.g. "2026-03") to identify partial month
 */
export function parseMissionCsv(text: string, currentYearMonth: string): FeuerwehrSummary | null {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  // Skip header row (index 0)
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i].split(','));
    if (row) rows.push(row);
  }

  if (rows.length === 0) return null;

  // Sort by month ascending
  rows.sort((a, b) => a.reportMonth.localeCompare(b.reportMonth));

  // Check if the last row matches the current month (partial data)
  const lastRow = rows[rows.length - 1];
  const hasPartial = lastRow.reportMonth === currentYearMonth;

  const partial: FeuerwehrMonthData | null = hasPartial ? lastRow : null;

  // Complete months = all rows except the partial (if present)
  const completeRows = hasPartial ? rows.slice(0, -1) : rows;

  if (completeRows.length === 0) return null;

  const current = completeRows[completeRows.length - 1];
  const previous = completeRows.length >= 2 ? completeRows[completeRows.length - 2] : null;

  return { current, partial, previous };
}

export function createFeuerwehrIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestFeuerwehr(): Promise<void> {
    try {
      const res = await log.fetch(CSV_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        log.warn(`GitHub CSV returned ${res.status}`);
        return;
      }

      const text = await res.text();
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const summary = parseMissionCsv(text, currentYearMonth);

      if (!summary) {
        log.warn('No valid Feuerwehr data in CSV');
        return;
      }

      cache.set(CACHE_KEY, summary, TTL_SECONDS);

      if (db) {
        try {
          await saveFeuerwehr(db, 'berlin', summary);
        } catch (err) {
          log.error('DB write failed', err);
        }
      }

      log.info(`Berlin Feuerwehr updated: ${summary.current.missionCountAll} missions (${summary.current.reportMonth})`);
    } catch (err) {
      log.error('Feuerwehr ingestion failed', err);
    }
  };
}
