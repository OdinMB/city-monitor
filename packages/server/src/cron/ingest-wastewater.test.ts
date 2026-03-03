/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createWastewaterIngestion } from './ingest-wastewater.js';
import type { WastewaterSummary } from '@city-monitor/shared';

// CSV header + data rows (semicolon-delimited, German decimals)
const CSV_HEADER = '"Probennummer";"Datum";"Klärwerk";"UWW_Code";"UWW_Name";"Durchfluss";"Abwasser_Temperatur";"Abwasser_pH";"Methode";"Erreger";"Target";"Messwert"';

function row(date: string, plant: string, pathogen: string, value: string): string {
  const code = plant === 'Ruhleben' ? 'DETP_BE01' : plant === 'Schönerlinde' ? 'DETP_BE02' : 'DETP_BE03';
  const target = pathogen === 'Influenza A' ? 'M1 Gen' : pathogen === 'Influenza B' ? 'NS2 Gen' : 'RSV_N Gen';
  return `"12345";"${date}";"Klärwerk ${plant}";"${code}";"${plant}";"200000,0000";"20,00";"7,200";"dPCR mit Inhibitorentfernung";"${pathogen}";"${target}";"${value}"`;
}

function buildCsv(...rows: string[]): string {
  return [CSV_HEADER, ...rows].join('\n');
}

// Two weeks of data across 3 plants, 3 pathogens
const mockCsvFull = buildCsv(
  // Week 2 (latest) — 2025-12-14
  row('2025-12-14', 'Ruhleben', 'Influenza A', '30000,00'),
  row('2025-12-14', 'Ruhleben', 'Influenza B', '1000,00'),
  row('2025-12-14', 'Ruhleben', 'RSV', '0,00'),
  row('2025-12-14', 'Schönerlinde', 'Influenza A', '60000,00'),
  row('2025-12-14', 'Schönerlinde', 'Influenza B', '2000,00'),
  row('2025-12-14', 'Schönerlinde', 'RSV', '0,00'),
  row('2025-12-14', 'Waßmannsdorf', 'Influenza A', '45000,00'),
  row('2025-12-14', 'Waßmannsdorf', 'Influenza B', '3000,00'),
  row('2025-12-14', 'Waßmannsdorf', 'RSV', '0,00'),
  // Week 1 (previous) — 2025-12-07
  row('2025-12-07', 'Ruhleben', 'Influenza A', '10000,00'),
  row('2025-12-07', 'Ruhleben', 'Influenza B', '1000,00'),
  row('2025-12-07', 'Ruhleben', 'RSV', '500,00'),
  row('2025-12-07', 'Schönerlinde', 'Influenza A', '20000,00'),
  row('2025-12-07', 'Schönerlinde', 'Influenza B', '2000,00'),
  row('2025-12-07', 'Schönerlinde', 'RSV', '700,00'),
  row('2025-12-07', 'Waßmannsdorf', 'Influenza A', '15000,00'),
  row('2025-12-07', 'Waßmannsdorf', 'Influenza B', '3000,00'),
  row('2025-12-07', 'Waßmannsdorf', 'RSV', '300,00'),
);

// 4 weeks of data for sparkline / level testing (single plant for simplicity)
// Max non-zero for Flu A across all dates: 100000 (week 2)
// Latest value = 50000, which is 50% of max → moderate
const mockCsvMultiWeek = buildCsv(
  row('2025-12-28', 'Ruhleben', 'Influenza A', '50000,00'),  // latest: 50% of max → moderate
  row('2025-12-21', 'Ruhleben', 'Influenza A', '100000,00'), // max non-zero value
  row('2025-12-14', 'Ruhleben', 'Influenza A', '20000,00'),  // 20% of max → low
  row('2025-12-07', 'Ruhleben', 'Influenza A', '0,00'),      // none
);

describe('ingest-wastewater', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses CSV and caches WastewaterSummary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvFull, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary');
    expect(summary).toBeTruthy();
    expect(summary!.pathogens).toHaveLength(3);
    expect(summary!.sampleDate).toBe('2025-12-14');
    expect(summary!.plantCount).toBe(3);
  });

  it('averages Messwert across plants per pathogen', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvFull, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    // (30000 + 60000 + 45000) / 3 = 45000
    expect(fluA.value).toBe(45000);

    const fluB = summary.pathogens.find((p) => p.name === 'Influenza B')!;
    // (1000 + 2000 + 3000) / 3 = 2000
    expect(fluB.value).toBe(2000);

    const rsv = summary.pathogens.find((p) => p.name === 'RSV')!;
    // (0 + 0 + 0) / 3 = 0
    expect(rsv.value).toBe(0);
  });

  it('computes previous week values correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvFull, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    // (10000 + 20000 + 15000) / 3 = 15000
    expect(fluA.previousValue).toBe(15000);
  });

  it('computes trend "rising" when current > 1.5x previous', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvFull, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    // 45000 / 15000 = 3.0 > 1.5 → rising
    expect(fluA.trend).toBe('rising');
  });

  it('computes trend "stable" when change is within thresholds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvFull, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluB = summary.pathogens.find((p) => p.name === 'Influenza B')!;
    // 2000 / 2000 = 1.0 → stable
    expect(fluB.trend).toBe('stable');
  });

  it('computes trend "gone" when current is 0 but previous was > 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvFull, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const rsv = summary.pathogens.find((p) => p.name === 'RSV')!;
    // current=0, previous=500 → gone
    expect(rsv.trend).toBe('gone');
  });

  it('computes trend "new" when previous was 0 but current > 0', async () => {
    const csv = buildCsv(
      row('2025-12-14', 'Ruhleben', 'RSV', '5000,00'),
      row('2025-12-07', 'Ruhleben', 'RSV', '0,00'),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csv, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const rsv = summary.pathogens.find((p) => p.name === 'RSV')!;
    expect(rsv.trend).toBe('new');
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest(); // should not throw

    expect(cache.get('berlin:wastewater:summary')).toBeNull();
  });

  it('handles empty CSV (header only)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(CSV_HEADER, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    expect(cache.get('berlin:wastewater:summary')).toBeNull();
  });

  it('uses 7-day TTL for cache entry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvFull, { status: 200 }),
    );

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    expect(setSpy).toHaveBeenCalledWith(
      'berlin:wastewater:summary',
      expect.any(Object),
      604800,
    );
  });

  it('handles German decimal format correctly', async () => {
    const csv = buildCsv(
      row('2025-12-14', 'Ruhleben', 'Influenza A', '12345,6789'),
      row('2025-12-07', 'Ruhleben', 'Influenza A', '1000,50'),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csv, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.value).toBeCloseTo(12345.6789, 2);
    expect(fluA.previousValue).toBeCloseTo(1000.5, 2);
  });

  it('handles single date (no previous week)', async () => {
    const csv = buildCsv(
      row('2025-12-14', 'Ruhleben', 'Influenza A', '30000,00'),
      row('2025-12-14', 'Ruhleben', 'Influenza B', '1000,00'),
      row('2025-12-14', 'Ruhleben', 'RSV', '0,00'),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csv, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    expect(summary.sampleDate).toBe('2025-12-14');
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.previousValue).toBe(0);
    expect(fluA.trend).toBe('stable');
  });

  it('computes level "moderate" when value is 50% of historical max', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvMultiWeek, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    // 50000 / 100000 = 50% → moderate (≤50%)
    expect(fluA.level).toBe('moderate');
  });

  it('computes level "none" when value is 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvFull, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const rsv = summary.pathogens.find((p) => p.name === 'RSV')!;
    expect(rsv.level).toBe('none');
  });

  it('computes level "high" when value > 50% of max', async () => {
    const csv = buildCsv(
      row('2025-12-28', 'Ruhleben', 'Influenza A', '80000,00'),  // 80% of 100k → high
      row('2025-12-21', 'Ruhleben', 'Influenza A', '100000,00'),
      row('2025-12-14', 'Ruhleben', 'Influenza A', '10000,00'),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csv, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.level).toBe('high');
  });

  it('computes level "low" when value ≤ 25% of max', async () => {
    const csv = buildCsv(
      row('2025-12-28', 'Ruhleben', 'Influenza A', '20000,00'),  // 20% of 100k → low
      row('2025-12-21', 'Ruhleben', 'Influenza A', '100000,00'),
      row('2025-12-14', 'Ruhleben', 'Influenza A', '50000,00'),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csv, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.level).toBe('low');
  });

  it('builds history array with correct length and order (oldest first)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvMultiWeek, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    // 4 dates available, all should be in history (< 12 so no truncation)
    expect(fluA.history).toHaveLength(4);
    // oldest first: 2025-12-07 (0), 2025-12-14 (20000), 2025-12-21 (100000), 2025-12-28 (50000)
    expect(fluA.history).toEqual([0, 20000, 100000, 50000]);
  });

  it('caps history at 12 entries', async () => {
    // Build 14 weeks of data
    const rows: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(2025, 11, 28 - i * 7);
      const dateStr = d.toISOString().split('T')[0];
      rows.push(row(dateStr, 'Ruhleben', 'Influenza A', `${(i + 1) * 1000},00`));
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(...rows), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.history).toHaveLength(12);
    // Oldest first — last 12 dates sorted ascending by date
    // Dates descending: 2025-12-28 (1000), 2025-12-21 (2000), ..., 2025-10-05 (12000), 2025-09-28 (13000), 2025-09-21 (14000)
    // Last 12 = dates[0..11] → 2025-12-28 through 2025-10-12
    // Reversed to oldest-first: 2025-10-12 (12000), 2025-10-19 (11000), ..., 2025-12-28 (1000)
    expect(fluA.history[0]).toBe(12000);
    expect(fluA.history[11]).toBe(1000);
  });

  it('existing tests still have level and history fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockCsvFull, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    for (const p of summary.pathogens) {
      expect(p).toHaveProperty('level');
      expect(p).toHaveProperty('history');
      expect(['none', 'low', 'moderate', 'high']).toContain(p.level);
      expect(Array.isArray(p.history)).toBe(true);
    }
  });
});
