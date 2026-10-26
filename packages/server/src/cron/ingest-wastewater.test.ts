import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createWastewaterIngestion, parseAmelagBerlinCovid, buildCovidPathogen, computeTrend, computeLevel } from './ingest-wastewater.js';
import type { WastewaterSummary } from '@city-monitor/shared';
import type { Db } from '../db/index.js';

const mockSaveWastewater = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveWastewater: (...args: unknown[]) => mockSaveWastewater(...args),
}));

// --- Lageso CSV helpers ---

const CSV_HEADER = '"Probennummer";"Datum";"Klärwerk";"UWW_Code";"UWW_Name";"Durchfluss";"Abwasser_Temperatur";"Abwasser_pH";"Methode";"Erreger";"Target";"Messwert"';

function row(date: string, plant: string, pathogen: string, value: string): string {
  const code = plant === 'Ruhleben' ? 'DETP_BE01' : plant === 'Schönerlinde' ? 'DETP_BE02' : 'DETP_BE03';
  const target = pathogen === 'Influenza A' ? 'M1 Gen' : pathogen === 'Influenza B' ? 'NS2 Gen' : 'RSV_N Gen';
  return `"12345";"${date}";"Klärwerk ${plant}";"${code}";"${plant}";"200000,0000";"20,00";"7,200";"dPCR mit Inhibitorentfernung";"${pathogen}";"${target}";"${value}"`;
}

function buildCsv(...rows: string[]): string {
  return [CSV_HEADER, ...rows].join('\n');
}

// --- AMELAG TSV helpers ---

const TSV_HEADER = 'standort\tbundesland\tdatum\tviruslast\tviruslast_normalisiert\tvorhersage\tobere_schranke\tuntere_schranke\teinwohner\tlaborwechsel\ttyp\tunter_bg';

function amelagRow(plant: string, bundesland: string, date: string, viruslast: string, typ: string): string {
  return `${plant}\t${bundesland}\t${date}\t${viruslast}\t1.0\t\t\t\t1000000\t0\t${typ}\t0`;
}

function buildTsv(...rows: string[]): string {
  return [TSV_HEADER, ...rows].join('\n');
}

/**
 * Mock fetch to return different responses for Lageso and AMELAG URLs.
 * By default, AMELAG returns 500 so existing Lageso-only tests are unaffected.
 */
function mockFetch(lagesoBody: string, amelagBody?: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.includes('lageso.de')) {
      return new Response(lagesoBody, { status: 200 });
    }
    if (url.includes('github')) {
      if (amelagBody !== undefined) {
        return new Response(amelagBody, { status: 200 });
      }
      return new Response('', { status: 500 });
    }
    return new Response('', { status: 404 });
  });
}

function mockFetchFail() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return new Response('', { status: 500 });
  });
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
const mockCsvMultiWeek = buildCsv(
  row('2025-12-28', 'Ruhleben', 'Influenza A', '50000,00'),
  row('2025-12-21', 'Ruhleben', 'Influenza A', '100000,00'),
  row('2025-12-14', 'Ruhleben', 'Influenza A', '20000,00'),
  row('2025-12-07', 'Ruhleben', 'Influenza A', '0,00'),
);

describe('ingest-wastewater (active cities)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSaveWastewater.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('makes no request and writes nothing when Berlin is not active', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    mockFetch(mockCsvFull);

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    await createWastewaterIngestion(cache, {} as Db)();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect(mockSaveWastewater).not.toHaveBeenCalled();
  });

  it.each(['berlin', 'berlin,hamburg', 'hamburg,berlin'])(
    'fetches Lageso then AMELAG and writes Berlin rows when ACTIVE_CITIES=%s',
    async (activeCities) => {
      vi.stubEnv('ACTIVE_CITIES', activeCities);
      mockFetch(mockCsvFull);

      const cache = createCache();
      const setSpy = vi.spyOn(cache, 'set');
      const db = {} as Db;
      await createWastewaterIngestion(cache, db)();

      expect(vi.mocked(globalThis.fetch).mock.calls.map((c) => c[0])).toEqual([
        'https://data.lageso.de/infektionsschutz/opendata/abwassermonitoring/BEWAC_abwassermonitoring_berlin.csv',
        'https://raw.githubusercontent.com/robert-koch-institut/Abwassersurveillance_AMELAG/main/amelag_einzelstandorte.tsv',
      ]);
      expect(setSpy).toHaveBeenCalledTimes(1);
      expect(setSpy).toHaveBeenCalledWith('berlin:wastewater:summary', expect.any(Object), 604800);
      expect(mockSaveWastewater).toHaveBeenCalledTimes(1);
      expect(mockSaveWastewater).toHaveBeenCalledWith(db, 'berlin', setSpy.mock.calls[0]![1]);
    },
  );
});

describe('ingest-wastewater (Lageso)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses CSV and caches WastewaterSummary', async () => {
    mockFetch(mockCsvFull);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary');
    expect(summary).toBeTruthy();
    // 3 Lageso pathogens (AMELAG fails with 500 → no SARS-CoV-2)
    expect(summary!.pathogens).toHaveLength(3);
    expect(summary!.sampleDate).toBe('2025-12-14');
    expect(summary!.plantCount).toBe(3);
  });

  it('averages Messwert across plants per pathogen', async () => {
    mockFetch(mockCsvFull);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.value).toBe(45000);

    const fluB = summary.pathogens.find((p) => p.name === 'Influenza B')!;
    expect(fluB.value).toBe(2000);

    const rsv = summary.pathogens.find((p) => p.name === 'RSV')!;
    expect(rsv.value).toBe(0);
  });

  it('computes previous week values correctly', async () => {
    mockFetch(mockCsvFull);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.previousValue).toBe(15000);
  });

  it('computes trend "rising" when current > 1.5x previous', async () => {
    mockFetch(mockCsvFull);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.trend).toBe('rising');
  });

  it('computes trend "stable" when change is within thresholds', async () => {
    mockFetch(mockCsvFull);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluB = summary.pathogens.find((p) => p.name === 'Influenza B')!;
    expect(fluB.trend).toBe('stable');
  });

  it('computes trend "gone" when current is 0 but previous was > 0', async () => {
    mockFetch(mockCsvFull);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const rsv = summary.pathogens.find((p) => p.name === 'RSV')!;
    expect(rsv.trend).toBe('gone');
  });

  it('computes trend "new" when previous was 0 but current > 0', async () => {
    const csv = buildCsv(
      row('2025-12-14', 'Ruhleben', 'RSV', '5000,00'),
      row('2025-12-07', 'Ruhleben', 'RSV', '0,00'),
    );
    mockFetch(csv);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const rsv = summary.pathogens.find((p) => p.name === 'RSV')!;
    expect(rsv.trend).toBe('new');
  });

  it('handles fetch failure gracefully', async () => {
    mockFetchFail();

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    expect(cache.get('berlin:wastewater:summary')).toBeNull();
  });

  it('handles empty CSV (header only)', async () => {
    mockFetch(CSV_HEADER);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    expect(cache.get('berlin:wastewater:summary')).toBeNull();
  });

  it('uses 7-day TTL for cache entry', async () => {
    mockFetch(mockCsvFull);

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
    mockFetch(csv);

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
    mockFetch(csv);

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
    mockFetch(mockCsvMultiWeek);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.level).toBe('moderate');
  });

  it('computes level "none" when value is 0', async () => {
    mockFetch(mockCsvFull);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const rsv = summary.pathogens.find((p) => p.name === 'RSV')!;
    expect(rsv.level).toBe('none');
  });

  it('computes level "high" when value > 50% of max', async () => {
    const csv = buildCsv(
      row('2025-12-28', 'Ruhleben', 'Influenza A', '80000,00'),
      row('2025-12-21', 'Ruhleben', 'Influenza A', '100000,00'),
      row('2025-12-14', 'Ruhleben', 'Influenza A', '10000,00'),
    );
    mockFetch(csv);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.level).toBe('high');
  });

  it('computes level "low" when value ≤ 25% of max', async () => {
    const csv = buildCsv(
      row('2025-12-28', 'Ruhleben', 'Influenza A', '20000,00'),
      row('2025-12-21', 'Ruhleben', 'Influenza A', '100000,00'),
      row('2025-12-14', 'Ruhleben', 'Influenza A', '50000,00'),
    );
    mockFetch(csv);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.level).toBe('low');
  });

  it('builds history array with correct length and order (oldest first)', async () => {
    mockFetch(mockCsvMultiWeek);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.history).toHaveLength(4);
    expect(fluA.history).toEqual([0, 20000, 100000, 50000]);
  });

  it('caps history at 12 entries', async () => {
    const rows: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(2025, 11, 28 - i * 7);
      const dateStr = d.toISOString().split('T')[0];
      rows.push(row(dateStr, 'Ruhleben', 'Influenza A', `${(i + 1) * 1000},00`));
    }
    mockFetch(buildCsv(...rows));

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const fluA = summary.pathogens.find((p) => p.name === 'Influenza A')!;
    expect(fluA.history).toHaveLength(12);
    expect(fluA.history[0]).toBe(12000);
    expect(fluA.history[11]).toBe(1000);
  });

  it('existing tests still have level and history fields', async () => {
    mockFetch(mockCsvFull);

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

describe('ingest-wastewater (AMELAG SARS-CoV-2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('merges SARS-CoV-2 from AMELAG into Lageso summary', async () => {
    const amelagTsv = buildTsv(
      amelagRow('Ruhleben', 'BE', '2025-12-10', '5000', 'SARS-CoV-2'),
      amelagRow('Schoenerlinde', 'BE', '2025-12-10', '3000', 'SARS-CoV-2'),
      amelagRow('Ruhleben', 'BE', '2025-12-03', '2000', 'SARS-CoV-2'),
      amelagRow('Schoenerlinde', 'BE', '2025-12-03', '1000', 'SARS-CoV-2'),
    );
    mockFetch(mockCsvFull, amelagTsv);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    expect(summary.pathogens).toHaveLength(4);
    const covid = summary.pathogens.find((p) => p.name === 'SARS-CoV-2')!;
    expect(covid).toBeTruthy();
    expect(covid.value).toBe(4000); // avg(5000, 3000)
    expect(covid.previousValue).toBe(1500); // avg(2000, 1000)
  });

  it('sets per-pathogen sampleDate when AMELAG date differs from Lageso', async () => {
    const amelagTsv = buildTsv(
      amelagRow('Ruhleben', 'BE', '2025-12-10', '5000', 'SARS-CoV-2'),
      amelagRow('Ruhleben', 'BE', '2025-12-03', '2000', 'SARS-CoV-2'),
    );
    mockFetch(mockCsvFull, amelagTsv);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const covid = summary.pathogens.find((p) => p.name === 'SARS-CoV-2')!;
    // Lageso date is 2025-12-14, AMELAG date is 2025-12-10 → different
    expect(covid.sampleDate).toBe('2025-12-10');
  });

  it('omits per-pathogen sampleDate when dates match', async () => {
    const amelagTsv = buildTsv(
      amelagRow('Ruhleben', 'BE', '2025-12-14', '5000', 'SARS-CoV-2'),
      amelagRow('Ruhleben', 'BE', '2025-12-07', '2000', 'SARS-CoV-2'),
    );
    mockFetch(mockCsvFull, amelagTsv);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const covid = summary.pathogens.find((p) => p.name === 'SARS-CoV-2')!;
    expect(covid.sampleDate).toBeUndefined();
  });

  it('filters out non-Berlin and non-SARS-CoV-2 rows from AMELAG', async () => {
    const amelagTsv = buildTsv(
      amelagRow('Ruhleben', 'BE', '2025-12-10', '5000', 'SARS-CoV-2'),
      amelagRow('Hamburg-Dradenau', 'HH', '2025-12-10', '9999', 'SARS-CoV-2'),
      amelagRow('Ruhleben', 'BE', '2025-12-10', '8888', 'Influenza A'),
      amelagRow('Ruhleben', 'BE', '2025-12-03', '2000', 'SARS-CoV-2'),
    );
    mockFetch(mockCsvFull, amelagTsv);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    const covid = summary.pathogens.find((p) => p.name === 'SARS-CoV-2')!;
    // Only Berlin SARS-CoV-2 row for 2025-12-10 → value = 5000 (not 9999 or 8888)
    expect(covid.value).toBe(5000);
  });

  it('still caches Lageso data when AMELAG fetch fails', async () => {
    // AMELAG returns 500 (default mockFetch behavior without amelagBody)
    mockFetch(mockCsvFull);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    expect(summary.pathogens).toHaveLength(3);
    expect(summary.pathogens.find((p) => p.name === 'SARS-CoV-2')).toBeUndefined();
  });

  it('still caches Lageso data when AMELAG TSV has no Berlin data', async () => {
    const amelagTsv = buildTsv(
      amelagRow('Hamburg-Dradenau', 'HH', '2025-12-10', '5000', 'SARS-CoV-2'),
    );
    mockFetch(mockCsvFull, amelagTsv);

    const cache = createCache();
    const ingest = createWastewaterIngestion(cache);
    await ingest();

    const summary = cache.get<WastewaterSummary>('berlin:wastewater:summary')!;
    expect(summary.pathogens).toHaveLength(3);
  });
});

describe('parseAmelagBerlinCovid', () => {
  it('stream-parses TSV and returns only Berlin SARS-CoV-2 rows', async () => {
    const tsv = buildTsv(
      amelagRow('Ruhleben', 'BE', '2025-12-10', '5000.5', 'SARS-CoV-2'),
      amelagRow('Hamburg-Dradenau', 'HH', '2025-12-10', '9999', 'SARS-CoV-2'),
      amelagRow('Ruhleben', 'BE', '2025-12-10', '8888', 'Influenza A'),
      amelagRow('Schoenerlinde', 'BE', '2025-12-03', '2000', 'SARS-CoV-2'),
    );
    const response = new Response(tsv, { status: 200 });
    const rows = await parseAmelagBerlinCovid(response);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ date: '2025-12-10', plant: 'Ruhleben', value: 5000.5 });
    expect(rows[1]).toEqual({ date: '2025-12-03', plant: 'Schoenerlinde', value: 2000 });
  });

  it('returns empty array for empty TSV', async () => {
    const response = new Response(TSV_HEADER + '\n', { status: 200 });
    const rows = await parseAmelagBerlinCovid(response);
    expect(rows).toEqual([]);
  });
});

describe('buildCovidPathogen', () => {
  it('builds pathogen with trend and level from AMELAG rows', () => {
    const rows = [
      { date: '2025-12-10', plant: 'Ruhleben', value: 6000 },
      { date: '2025-12-10', plant: 'Schoenerlinde', value: 4000 },
      { date: '2025-12-03', plant: 'Ruhleben', value: 2000 },
      { date: '2025-12-03', plant: 'Schoenerlinde', value: 1000 },
    ];
    const pathogen = buildCovidPathogen(rows)!;

    expect(pathogen.name).toBe('SARS-CoV-2');
    expect(pathogen.value).toBe(5000); // avg(6000, 4000)
    expect(pathogen.previousValue).toBe(1500); // avg(2000, 1000)
    expect(pathogen.trend).toBe('rising'); // 5000 / 1500 = 3.33 > 1.5
    expect(pathogen.sampleDate).toBe('2025-12-10');
  });

  it('returns null for empty rows', () => {
    expect(buildCovidPathogen([])).toBeNull();
  });

  it('builds history oldest-first, capped at 12', () => {
    const rows = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(2025, 11, 28 - i * 7);
      rows.push({ date: d.toISOString().split('T')[0], plant: 'Ruhleben', value: (i + 1) * 100 });
    }
    const pathogen = buildCovidPathogen(rows)!;
    expect(pathogen.history).toHaveLength(12);
    // Oldest first: dates[11] value=1200, ..., dates[0] value=100
    expect(pathogen.history[0]).toBe(1200);
    expect(pathogen.history[11]).toBe(100);
  });
});

describe('computeTrend', () => {
  it('returns "stable" when both zero', () => expect(computeTrend(0, 0)).toBe('stable'));
  it('returns "new" when previous zero', () => expect(computeTrend(100, 0)).toBe('new'));
  it('returns "gone" when current zero', () => expect(computeTrend(0, 100)).toBe('gone'));
  it('returns "rising" above threshold', () => expect(computeTrend(200, 100)).toBe('rising'));
  it('returns "falling" below threshold', () => expect(computeTrend(50, 100)).toBe('falling'));
  it('returns "stable" within thresholds', () => expect(computeTrend(120, 100)).toBe('stable'));
});

describe('computeLevel', () => {
  it('returns "none" for zero value', () => expect(computeLevel(0, 1000)).toBe('none'));
  it('returns "low" for ≤25%', () => expect(computeLevel(250, 1000)).toBe('low'));
  it('returns "moderate" for ≤50%', () => expect(computeLevel(500, 1000)).toBe('moderate'));
  it('returns "high" for >50%', () => expect(computeLevel(600, 1000)).toBe('high'));
});
