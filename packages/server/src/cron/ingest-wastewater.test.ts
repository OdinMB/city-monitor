import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createWastewaterIngestion, parseAmelagSites, buildAmelagPathogen, buildAmelagSummary, computeTrend, computeLevel } from './ingest-wastewater.js';
import type { AmelagRow } from './ingest-wastewater.js';
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
 * amelag_einzelstandorte.tsv as recorded on 2026-11-02, trimmed to samples
 * from 2026-09-28 of Hamburg 01/02, Köln and München (the tile's pathogens
 * plus Köln's RSV A), Berlin Ruhleben's SARS-CoV-2 and one unsampled day
 * (NA); the unparsed model columns 5-8 blanked to NA.
 */
const AMELAG_FIXTURE = readFileSync(new URL('./fixtures/amelag-einzelstandorte-trimmed.tsv', import.meta.url), 'utf8');

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

  const LAGESO_URL = 'https://data.lageso.de/infektionsschutz/opendata/abwassermonitoring/BEWAC_abwassermonitoring_berlin.csv';
  const AMELAG_URL = 'https://raw.githubusercontent.com/robert-koch-institut/Abwassersurveillance_AMELAG/main/amelag_einzelstandorte.tsv';

  it('fetches AMELAG then LAGeSo and writes Berlin rows when Berlin is active alone', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    mockFetch(mockCsvFull);

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    const db = {} as Db;
    await createWastewaterIngestion(cache, db)();

    expect(vi.mocked(globalThis.fetch).mock.calls.map((c) => c[0])).toEqual([AMELAG_URL, LAGESO_URL]);
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith('berlin:wastewater:summary', expect.any(Object), 604800);
    expect(mockSaveWastewater).toHaveBeenCalledTimes(1);
    expect(mockSaveWastewater).toHaveBeenCalledWith(db, 'berlin', setSpy.mock.calls[0]![1]);
  });

  it('downloads the nationwide AMELAG file once for every city and writes each city under its id', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg,berlin,koeln,muenchen');
    mockFetch(mockCsvFull, AMELAG_FIXTURE);

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    await createWastewaterIngestion(cache, {} as Db)();

    expect(vi.mocked(globalThis.fetch).mock.calls.map((c) => c[0])).toEqual([AMELAG_URL, LAGESO_URL]);
    expect(setSpy.mock.calls.map((c) => c[0])).toEqual([
      'hamburg:wastewater:summary', 'berlin:wastewater:summary', 'koeln:wastewater:summary', 'muenchen:wastewater:summary',
    ]);
    expect(mockSaveWastewater.mock.calls.map((c) => c[1])).toEqual(['hamburg', 'berlin', 'koeln', 'muenchen']);
  });

  it('leaves an AMELAG city unwritten when AMELAG fails, and still writes Berlin from LAGeSo', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,koeln');
    mockFetch(mockCsvFull); // AMELAG answers 500

    const cache = createCache();
    await createWastewaterIngestion(cache, {} as Db)();

    expect(cache.get('koeln:wastewater:summary')).toBeNull();
    expect(cache.get<WastewaterSummary>('berlin:wastewater:summary')!.pathogens.map((p) => p.name))
      .toEqual(['Influenza A', 'Influenza B', 'RSV']);
  });
});

describe('ingest-wastewater (AMELAG cities, recorded file)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function ingestFor(cityId: string): Promise<WastewaterSummary> {
    vi.stubEnv('ACTIVE_CITIES', cityId);
    mockFetch(mockCsvFull, AMELAG_FIXTURE);
    const cache = createCache();
    await createWastewaterIngestion(cache)();
    return cache.get<WastewaterSummary>(`${cityId}:wastewater:summary`)!;
  }

  const weighted = (pairs: Array<[value: number, population: number]>) =>
    pairs.reduce((s, [v, p]) => s + v * p, 0) / pairs.reduce((s, [, p]) => s + p, 0);

  it('combines Hamburg\'s two plants per week, weighted by the people each serves', async () => {
    const summary = await ingestFor('hamburg');

    expect(summary.sampleDate).toBe('2026-10-21');
    expect(summary.plantCount).toBe(2);
    expect(summary.pathogens.map((p) => p.name)).toEqual(['Influenza A', 'Influenza B', 'RSV', 'SARS-CoV-2']);

    const covid = summary.pathogens[3]!;
    // Week of 2026-10-19: Hamburg 01 sampled 244,000 and 315,000; Hamburg 02 206,000 and 293,000
    expect(covid.value).toBeCloseTo(weighted([[279500, 581423], [249500, 1464784]]), 6);
    expect(covid.previousValue).toBeCloseTo(weighted([[144700, 581423], [191500, 1464784]]), 6);
    expect(covid.trend).toBe('stable'); // 1.45x
    expect(covid.level).toBe('high'); // the highest week of the four
    expect(covid.history).toHaveLength(4); // one value per week, 2026-09-28 to 2026-10-19
    expect(covid.sampleDate).toBeUndefined();
  });

  it('counts samples below the detection limit as zero, so an absent pathogen shows as none', async () => {
    const summary = await ingestFor('hamburg');
    // Every flu and RSV sample is flagged unter_bg (10,000 and 35,000 gc/L are the lab's limits)
    for (const p of summary.pathogens.slice(0, 3)) {
      expect(p, p.name).toMatchObject({ value: 0, previousValue: 0, level: 'none', trend: 'stable', history: [0, 0, 0, 0] });
    }
  });

  it('reads Köln\'s plant, taking the combined RSV A+B and leaving out RSV A', async () => {
    const summary = await ingestFor('koeln');

    expect(summary.sampleDate).toBe('2026-10-21');
    expect(summary.plantCount).toBe(1);
    const [fluA, , rsv, covid] = summary.pathogens;
    // Week of 2026-09-28: 2,411.25 and a sample below the limit (counted as 0)
    const expectedFluA = [(2411.25 + 0) / 2, (5866.58 + 3038.54) / 2, (4834.93 + 5731.85) / 2, (9699.2 + 3957.29) / 2];
    expect(fluA!.history).toHaveLength(4);
    fluA!.history.forEach((v, i) => expect(v).toBeCloseTo(expectedFluA[i]!, 6));
    expect(fluA!.level).toBe('high');
    // RSV A+B measured once (2026-09-28); every later sample is below the limit
    expect(rsv!.name).toBe('RSV');
    expect(rsv!.history).toEqual([10044.36 / 2, 0, 0, 0]);
    expect(rsv!.trend).toBe('stable');
    expect(covid!.value).toBe((45300 + 65700) / 2);
    expect(covid!.trend).toBe('falling'); // 55,500 after 91,800
  });

  it('reads München\'s plant, mapping RSV A/B to RSV', async () => {
    const summary = await ingestFor('muenchen');

    expect(summary.sampleDate).toBe('2026-10-14');
    expect(summary.pathogens.map((p) => p.name)).toEqual(['Influenza A', 'Influenza B', 'RSV', 'SARS-CoV-2']);
    const [fluA, , , covid] = summary.pathogens;
    expect(fluA!.trend).toBe('gone'); // 1,885 the week before, below the limit since
    expect(covid!.value).toBe((25400 + 24200) / 2);
    expect(covid!.previousValue).toBe((41300 + 51500) / 2);
    expect(covid!.trend).toBe('falling');
  });

  it('gives Berlin SARS-CoV-2 from its own plants only, with AMELAG\'s sample date', async () => {
    const summary = await ingestFor('berlin');
    const covid = summary.pathogens.find((p) => p.name === 'SARS-CoV-2')!;
    // Only Berlin Ruhleben is in the recorded file: the week of 2026-10-05 sampled 72,700 and 90,800
    expect(covid.value).toBe((72700 + 90800) / 2);
    expect(covid.previousValue).toBe(70500);
    expect(covid.sampleDate).toBe('2026-10-11');
  });
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
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-10', '5000', 'SARS-CoV-2'),
      amelagRow('Berlin Schönerlinde', 'BE', '2025-12-10', '3000', 'SARS-CoV-2'),
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-03', '2000', 'SARS-CoV-2'),
      amelagRow('Berlin Schönerlinde', 'BE', '2025-12-03', '1000', 'SARS-CoV-2'),
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
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-10', '5000', 'SARS-CoV-2'),
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-03', '2000', 'SARS-CoV-2'),
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
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-14', '5000', 'SARS-CoV-2'),
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-07', '2000', 'SARS-CoV-2'),
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
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-10', '5000', 'SARS-CoV-2'),
      amelagRow('Hamburg-Dradenau', 'HH', '2025-12-10', '9999', 'SARS-CoV-2'),
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-10', '8888', 'Influenza A'),
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-03', '2000', 'SARS-CoV-2'),
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

describe('parseAmelagSites', () => {
  it('stream-parses the TSV, keeping the measured samples of the given plants and the tile\'s pathogens', async () => {
    const tsv = buildTsv(
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-10', '5000.5', 'SARS-CoV-2'),
      amelagRow('Hamburg-Dradenau', 'HH', '2025-12-10', '9999', 'SARS-CoV-2'),
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-10', '8888', 'Influenza A'),
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-10', '7777', 'Influenza A+B'),
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-10', '6666', 'RSV A/B'),
      amelagRow('Berlin Ruhleben', 'BE', '2025-12-11', 'NA', 'SARS-CoV-2'),
      amelagRow('Berlin Schönerlinde', 'BE', '2025-12-03', '2000', 'SARS-CoV-2'),
    );
    const rows = await parseAmelagSites(new Response(tsv, { status: 200 }), new Set(['Berlin Ruhleben', 'Berlin Schönerlinde']));

    expect(rows).toEqual([
      { site: 'Berlin Ruhleben', date: '2025-12-10', pathogen: 'SARS-CoV-2', value: 5000.5, population: 1000000 },
      { site: 'Berlin Ruhleben', date: '2025-12-10', pathogen: 'Influenza A', value: 8888, population: 1000000 },
      { site: 'Berlin Ruhleben', date: '2025-12-10', pathogen: 'RSV', value: 6666, population: 1000000 },
      { site: 'Berlin Schönerlinde', date: '2025-12-03', pathogen: 'SARS-CoV-2', value: 2000, population: 1000000 },
    ]);
  });

  it('reads the recorded file, whose last line has no newline after it', async () => {
    const rows = await parseAmelagSites(new Response(AMELAG_FIXTURE.trimEnd(), { status: 200 }), new Set(['München']));
    expect(rows).toHaveLength(20); // five samples each of Influenza A, Influenza B, RSV A/B and SARS-CoV-2
    expect(rows.at(-1)).toEqual({ site: 'München', date: '2026-10-14', pathogen: 'SARS-CoV-2', value: 24200, population: 1240000 });
  });

  it('returns empty array for empty TSV', async () => {
    const rows = await parseAmelagSites(new Response(TSV_HEADER + '\n', { status: 200 }), new Set(['Berlin Ruhleben']));
    expect(rows).toEqual([]);
  });
});

describe('buildAmelagPathogen', () => {
  const sample = (site: string, date: string, value: number, population = 1000): AmelagRow =>
    ({ site, date, pathogen: 'SARS-CoV-2', value, population });

  it('builds pathogen with trend and level from AMELAG rows', () => {
    const rows = [
      sample('Ruhleben', '2025-12-10', 6000),
      sample('Schoenerlinde', '2025-12-10', 4000),
      sample('Ruhleben', '2025-12-03', 2000),
      sample('Schoenerlinde', '2025-12-03', 1000),
    ];
    const pathogen = buildAmelagPathogen(rows, 'SARS-CoV-2')!;

    expect(pathogen.name).toBe('SARS-CoV-2');
    expect(pathogen.value).toBe(5000); // avg(6000, 4000)
    expect(pathogen.previousValue).toBe(1500); // avg(2000, 1000)
    expect(pathogen.trend).toBe('rising'); // 5000 / 1500 = 3.33 > 1.5
    expect(pathogen.sampleDate).toBe('2025-12-10');
    expect(pathogen.plantCount).toBe(2);
  });

  it('averages a plant\'s samples within a calendar week before weighting the plants by population', () => {
    const rows = [
      // Mon 2025-12-08 and Wed 2025-12-10 are one week; Sun 2025-12-14 too
      sample('A', '2025-12-08', 1000, 3000),
      sample('A', '2025-12-10', 3000, 3000),
      sample('B', '2025-12-14', 6000, 1000),
    ];
    const pathogen = buildAmelagPathogen(rows, 'SARS-CoV-2')!;
    expect(pathogen.history).toEqual([(2000 * 3000 + 6000 * 1000) / 4000]);
    expect(pathogen.sampleDate).toBe('2025-12-14');
  });

  it('returns null for empty rows', () => {
    expect(buildAmelagPathogen([], 'SARS-CoV-2')).toBeNull();
  });

  it('builds history oldest-first, capped at 12', () => {
    const rows: AmelagRow[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.UTC(2025, 11, 28 - i * 7));
      rows.push(sample('Ruhleben', d.toISOString().split('T')[0]!, (i + 1) * 100));
    }
    const pathogen = buildAmelagPathogen(rows, 'SARS-CoV-2')!;
    expect(pathogen.history).toHaveLength(12);
    // Oldest first: dates[11] value=1200, ..., dates[0] value=100
    expect(pathogen.history[0]).toBe(1200);
    expect(pathogen.history[11]).toBe(100);
  });
});

describe('buildAmelagSummary', () => {
  it('dates the tile by the newest sample and keeps an older pathogen\'s own date', () => {
    const summary = buildAmelagSummary([
      { site: 'X', date: '2025-12-10', pathogen: 'SARS-CoV-2', value: 100, population: 1 },
      { site: 'X', date: '2025-12-03', pathogen: 'Influenza A', value: 50, population: 1 },
    ])!;
    expect(summary.sampleDate).toBe('2025-12-10');
    expect(summary.pathogens.map((p) => [p.name, p.sampleDate])).toEqual([['Influenza A', '2025-12-03'], ['SARS-CoV-2', undefined]]);
  });

  it('returns null without samples', () => {
    expect(buildAmelagSummary([])).toBeNull();
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
