/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { BudgetSummary, BudgetAreaSummary, BudgetCategoryAmount } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveBudget } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ingest-budget');

const FETCH_TIMEOUT_MS = 30_000;
const CACHE_TTL = 86_400; // 24 hours

export interface ParsedBudgetRow {
  bereich: number;
  bereichName: string;
  hauptfunktion: number;
  hauptfunktionName: string;
  titelart: 'Einnahmetitel' | 'Ausgabetitel';
  jahr: number;
  betrag: number;
}

/**
 * RFC 4180-compliant CSV field splitter that respects double-quoted fields
 * containing semicolons and escaped quotes.
 */
export function splitCsvRow(line: string, delimiter = ';'): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Rejoin lines that were split inside a quoted field.
 * A line with an odd number of unescaped quotes is a continuation.
 */
function rejoinQuotedLines(rawLines: string[]): string[] {
  const result: string[] = [];
  let pending = '';
  for (const line of rawLines) {
    if (pending) {
      pending += '\n' + line;
    } else {
      pending = line;
    }
    // Count unescaped quotes (not doubled "")
    const quoteCount = (pending.match(/"/g) ?? []).length;
    if (quoteCount % 2 === 0) {
      result.push(pending);
      pending = '';
    }
  }
  if (pending) result.push(pending);
  return result;
}

/**
 * Parse the Berlin Doppelhaushalt CSV into typed rows.
 * Filters to year=2026 and BetragTyp=Soll only.
 */
export function parseBudgetCsv(raw: string): ParsedBudgetRow[] {
  // Strip UTF-8 BOM
  const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const lines = rejoinQuotedLines(text.split('\n'));

  // Skip header
  const rows: ParsedBudgetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const cols = splitCsvRow(line);
    // Need at least 27 columns (index 0-26)
    if (cols.length < 27) continue;

    const bereich = parseInt(cols[3]!, 10);
    if (isNaN(bereich)) continue;

    const jahr = parseInt(cols[24]!, 10);
    if (jahr !== 2026) continue;

    const betragTyp = cols[25]!;
    if (betragTyp !== 'Soll') continue;

    const titelart = cols[21]!;
    if (titelart !== 'Einnahmetitel' && titelart !== 'Ausgabetitel') continue;

    // parseFloat + comma-to-dot for German decimal format
    const betrag = parseFloat(cols[26]!.replace(',', '.'));
    if (isNaN(betrag)) continue;

    rows.push({
      bereich,
      bereichName: cols[4]!,
      hauptfunktion: parseInt(cols[15]!, 10) || 0,
      hauptfunktionName: cols[16]!,
      titelart,
      jahr,
      betrag,
    });
  }

  return rows;
}

/**
 * Aggregate parsed rows into a compact BudgetSummary.
 */
export function aggregateBudgetData(rows: ParsedBudgetRow[]): BudgetSummary {
  // Group by area
  const areaMap = new Map<number, {
    name: string;
    revenues: Map<number, { name: string; amount: number }>;
    expenses: Map<number, { name: string; amount: number }>;
  }>();

  for (const row of rows) {
    let area = areaMap.get(row.bereich);
    if (!area) {
      area = { name: row.bereichName, revenues: new Map(), expenses: new Map() };
      areaMap.set(row.bereich, area);
    }

    const bucket = row.titelart === 'Einnahmetitel' ? area.revenues : area.expenses;
    const existing = bucket.get(row.hauptfunktion);
    if (existing) {
      existing.amount += row.betrag;
    } else {
      bucket.set(row.hauptfunktion, { name: row.hauptfunktionName, amount: row.betrag });
    }
  }

  // Build per-area summaries
  const areas: BudgetAreaSummary[] = [];
  const totalRevenues = new Map<number, { name: string; amount: number }>();
  const totalExpenses = new Map<number, { name: string; amount: number }>();

  for (const [code, area] of areaMap) {
    const revenues = buildCategoryList(area.revenues);
    const expenses = buildCategoryList(area.expenses);

    areas.push({
      areaCode: code,
      areaName: area.name,
      revenues,
      expenses,
      totalRevenue: revenues.reduce((s, c) => s + c.amount, 0),
      totalExpense: expenses.reduce((s, c) => s + c.amount, 0),
    });

    // Accumulate for Berlin (Total)
    for (const [catCode, cat] of area.revenues) {
      const existing = totalRevenues.get(catCode);
      if (existing) existing.amount += cat.amount;
      else totalRevenues.set(catCode, { name: cat.name, amount: cat.amount });
    }
    for (const [catCode, cat] of area.expenses) {
      const existing = totalExpenses.get(catCode);
      if (existing) existing.amount += cat.amount;
      else totalExpenses.set(catCode, { name: cat.name, amount: cat.amount });
    }
  }

  // Add synthetic "Berlin (Total)" with areaCode -1
  const totalRevenue = areas.reduce((s, a) => s + a.totalRevenue, 0);
  const totalExpense = areas.reduce((s, a) => s + a.totalExpense, 0);
  areas.unshift({
    areaCode: -1,
    areaName: 'Berlin (Total)',
    revenues: buildCategoryList(totalRevenues),
    expenses: buildCategoryList(totalExpenses),
    totalRevenue,
    totalExpense,
  });

  return {
    year: '2026',
    areas,
    fetchedAt: new Date().toISOString(),
  };
}

function buildCategoryList(map: Map<number, { name: string; amount: number }>): BudgetCategoryAmount[] {
  return [...map.entries()]
    .map(([code, { name, amount }]) => ({ code, name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function createBudgetIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestBudget(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.budget) continue;
      try {
        await ingestCityBudget(city.id, city.dataSources.budget.csvUrl, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityBudget(cityId: string, csvUrl: string, cache: Cache, db: Db | null): Promise<void> {
  const response = await log.fetch(csvUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) {
    log.warn(`${cityId}: budget CSV returned ${response.status}`);
    return;
  }

  const text = await response.text();
  const rows = parseBudgetCsv(text);

  if (rows.length === 0) {
    log.warn(`${cityId}: no budget rows parsed`);
    return;
  }

  const summary = aggregateBudgetData(rows);
  cache.set(`${cityId}:budget`, summary, CACHE_TTL);

  if (db) {
    try {
      await saveBudget(db, cityId, summary);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: budget data updated — ${rows.length} rows, ${summary.areas.length} areas`);
}
