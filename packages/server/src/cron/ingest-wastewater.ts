/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { WastewaterPathogen, WastewaterSummary } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveWastewater } from '../db/writes.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ingest-wastewater');

const CSV_URL = 'https://data.lageso.de/infektionsschutz/opendata/abwassermonitoring/BEWAC_abwassermonitoring_berlin.csv';
const FETCH_TIMEOUT_MS = 30_000;
const WASTEWATER_TTL_SECONDS = 604800; // 7 days
const CACHE_KEY = 'berlin:wastewater:summary';

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

function computeTrend(current: number, previous: number): WastewaterPathogen['trend'] {
  if (previous === 0 && current === 0) return 'stable';
  if (previous === 0 && current > 0) return 'new';
  if (current === 0 && previous > 0) return 'gone';

  const ratio = current / previous;
  if (ratio > RISING_THRESHOLD) return 'rising';
  if (ratio < FALLING_THRESHOLD) return 'falling';
  return 'stable';
}

const HISTORY_LENGTH = 12;

function computeLevel(value: number, maxNonZero: number): WastewaterPathogen['level'] {
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

export function createWastewaterIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestWastewater(): Promise<void> {
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
