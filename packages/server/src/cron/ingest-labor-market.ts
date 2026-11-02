import type { CityDataSources, LaborMarketSummary } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveLaborMarket } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-labor-market');

const BA_TABLE_URL = 'https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/csv';
const FETCH_TIMEOUT_MS = 30_000;
const TTL_SECONDS = 86400; // 1 day

/**
 * The Eckwertetabelle URL for a city's BA area: the Land table
 * (`EckwerteTabelleALOBL?Bundesland=Hamburg`) or the Kreis table
 * (`EckwerteTabelleALOKr?Kreis=K%C3%B6ln%2C%20Stadt`). Both answer with the
 * same rows; only the metadata line reads `Land:` or `Kreis:`.
 */
export function baTableUrl(source: NonNullable<CityDataSources['laborMarket']>): string {
  const [table, param] = source.scope === 'bundesland'
    ? ['EckwerteTabelleALOBL', 'Bundesland']
    : ['EckwerteTabelleALOKr', 'Kreis'];
  return `${BA_TABLE_URL}/${table}?${param}=${encodeURIComponent(source.name)}`;
}

/** German month names → 1-based month number */
const GERMAN_MONTHS: Record<string, string> = {
  'Januar': '01', 'Februar': '02', 'März': '03', 'April': '04',
  'Mai': '05', 'Juni': '06', 'Juli': '07', 'August': '08',
  'September': '09', 'Oktober': '10', 'November': '11', 'Dezember': '12',
};

/** Parse German number: periods are thousands separators, commas are decimal separators.
 *  Returns 0 for non-numeric values like "-" (used by BA for unavailable changes). */
function parseGermanNumber(s: string): number {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** Extract ISO month (e.g. "2026-02") from a German month string like "Februar 2026" */
function parseReportMonth(header: string): string | null {
  const match = header.match(/^(\S+)\s+(\d{4})$/);
  if (!match) return null;
  const monthNum = GERMAN_MONTHS[match[1]];
  if (!monthNum) return null;
  return `${match[2]}-${monthNum}`;
}

interface ParsedRow {
  label: string;
  currentValue: string;
  yoyAbsolute: string;
  yoyPercent: string;
}

function parseCsv(text: string): { reportMonth: string | null; rows: ParsedRow[] } {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  // The BA API response has metadata headers before the data table.
  // Find the actual header line which starts with "Ausgewählte Merkmale".
  const headerIdx = lines.findIndex((l) => l.startsWith('Ausgewählte Merkmale'));
  if (headerIdx < 0 || headerIdx >= lines.length - 1) return { reportMonth: null, rows: [] };

  const headers = lines[headerIdx].split(';');
  // First data column header is the report month (e.g. "Februar 2026")
  const reportMonth = parseReportMonth(headers[1] ?? '');

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = lines[i].split(';');
    if (fields.length < 6) continue;
    // Stop at footer lines (copyright, notes)
    if (fields[0].startsWith('©') || fields[0].startsWith('Aus Gründen') || fields[0].startsWith('Die Produkte')) break;
    rows.push({
      label: fields[0],
      currentValue: fields[1],
      yoyAbsolute: fields[4],
      yoyPercent: fields[5],
    });
  }
  return { reportMonth, rows };
}

/** The tile's figures from one Eckwertetabelle CSV, or null when a row it needs is missing. */
export function parseLaborMarketCsv(text: string): LaborMarketSummary | null {
  const { reportMonth, rows } = parseCsv(text);
  if (!reportMonth || rows.length === 0) return null;

  // The CSV rows have a specific structure:
  // Row 0: "Arbeitslose insgesamt" — total unemployed
  // Row 1: "im Rechtskreis SGB III" — SGB III count
  // Row 2: "im Rechtskreis SGB II" — SGB II count
  // Row 3: "Unterbeschäftigung..." — underemployment
  // Row 4: "Arbeitslosenquote..." — overall unemployment rate
  // Row 5: "im Rechtskreis SGB III" — SGB III rate
  // Row 6: "im Rechtskreis SGB II" — SGB II rate
  // Row 7: "Unterbeschäftigungsquote..." — underemployment rate

  const totalRow = rows.find((r) => r.label === 'Arbeitslose insgesamt');
  const rateRow = rows.find((r) => r.label.startsWith('Arbeitslosenquote'));

  // SGB II rows: there are two "im Rechtskreis SGB II" rows.
  // The first is the count (after "Arbeitslose insgesamt"), the second is the rate (after "Arbeitslosenquote").
  const sgbIIRows = rows.filter((r) => r.label === 'im Rechtskreis SGB II');
  const sgbIICountRow = sgbIIRows[0];
  const sgbIIRateRow = sgbIIRows[1];

  const underemploymentCountRow = rows.find((r) => r.label.startsWith('Unterbeschäftigung ('));
  const underemploymentRateRow = rows.find((r) => r.label.startsWith('Unterbeschäftigungsquote'));

  if (!totalRow || !rateRow || !sgbIICountRow || !sgbIIRateRow || !underemploymentCountRow || !underemploymentRateRow) {
    return null;
  }

  return {
    unemploymentRate: parseGermanNumber(rateRow.currentValue),
    totalUnemployed: parseGermanNumber(totalRow.currentValue),
    yoyChangeAbsolute: parseGermanNumber(totalRow.yoyAbsolute),
    yoyChangePercent: parseGermanNumber(totalRow.yoyPercent),
    sgbIIRate: parseGermanNumber(sgbIIRateRow.currentValue),
    sgbIICount: parseGermanNumber(sgbIICountRow.currentValue),
    sgbIIYoyAbsolute: parseGermanNumber(sgbIICountRow.yoyAbsolute),
    sgbIIYoyPercent: parseGermanNumber(sgbIICountRow.yoyPercent),
    underemploymentRate: parseGermanNumber(underemploymentRateRow.currentValue),
    underemploymentCount: parseGermanNumber(underemploymentCountRow.currentValue),
    underemploymentYoyAbsolute: parseGermanNumber(underemploymentCountRow.yoyAbsolute),
    underemploymentYoyPercent: parseGermanNumber(underemploymentCountRow.yoyPercent),
    reportMonth,
  };
}

export function createLaborMarketIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestLaborMarket(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.laborMarket;
      if (!source) continue;

      try {
        const res = await log.fetch(baTableUrl(source), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) {
          log.warn(`${city.id}: BA API returned ${res.status}`);
          continue;
        }

        const summary = parseLaborMarketCsv(await res.text());
        if (!summary) {
          log.warn(`${city.id}: no valid labor market data in BA CSV`);
          continue;
        }

        cache.set(CK.laborMarket(city.id), summary, TTL_SECONDS);

        if (db) {
          try {
            await saveLaborMarket(db, city.id, summary);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }

        log.info(`${city.id} labor market updated: ${summary.unemploymentRate}% unemployment (${summary.reportMonth})`);
      } catch (err) {
        log.error(`${city.id} labor market ingestion failed`, err);
      }
    }
  };
}
