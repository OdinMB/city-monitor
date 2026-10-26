import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { createCache } from '../lib/cache.js';
import type { PopulationSummary } from '@city-monitor/shared';
// A static import loads the module graph (Drizzle, the DB schema) while the
// file is collected. An `await import()` inside a test put that load inside the
// first test's 5 s timeout, which it overran on a busy machine.
import { createPopulationIngestion } from './ingest-population.js';

// Build a mock XLSX workbook with T2 (age groups) and Schlüssel (PLR names)
async function buildMockXlsx(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  // --- Sheet "Schlüssel" (PLR name lookup) ---
  // Columns: BEZ, PGR, BZR, PLR, Planungsraumname (each geo column is 2 digits)
  const schluesselData = [
    ['Bezirk', 'Prognose-\r\nraum', 'Bezirks-\r\nregion', 'Planungs-\r\nraum', 'Planungsraumname'],
    [],
    ['Mitte'],
    [],
    ['01', '10', '01', '01', 'Stülerstraße'],
    ['01', '10', '01', '02', 'Großer Tiergarten'],
    ['02', '02', '01', '01', 'Alexanderplatzviertel'],
  ];
  const schluesselWs = wb.addWorksheet('Schlüssel');
  for (const row of schluesselData) {
    schluesselWs.addRow(row);
  }

  // --- Sheet "T2" (population by age groups per PLR) ---
  const t2Header = [
    'BEZ', 'PGR', 'BZR', 'PLR',
    'Insgesamt',
    'unter 6', '6 bis unter 15', '15 bis unter 18',
    '18 bis unter 27', '27 bis unter 45', '45 bis unter 55', '55 bis unter 65',
    '65 und älter',
    'weiblich', 'Ausländer/-innen',
  ];

  const t2Data = [
    // Title/metadata rows (should be skipped)
    ['SB A01-16-00 2025h02 T2'],
    ['Einwohnerinnen und Einwohner in Berlin am 31. Dezember 2025\r\nnach Planungsräumen und Altersgruppen'],
    [],
    t2Header,
    // Aggregation row: Bezirk-level (has BEZ but not all 4 geo columns filled -> skip)
    ['01', '', '', '', ' 10 000', ' 600', ' 900', ' 300', ' 1 200', ' 3 000', ' 1 500', ' 1 200', ' 1 300', ' 5 100', ' 2 500'],
    // Section header row (Bezirk name in total column -> skip)
    [null, null, null, null, 'Mitte'],
    // PLR data rows (all 4 geo columns filled with 2-digit values)
    ['01', '10', '01', '01', ' 5 000', ' 300', ' 450', ' 150', ' 600', ' 1 500', ' 750', ' 600', ' 650', ' 2 550', ' 1 200'],
    ['01', '10', '01', '02', ' 3 000', ' 200', ' 300', ' 100', ' 400', ' 1 000', ' 500', ' 300', ' 200', ' 1 530', ' 800'],
    ['02', '02', '01', '01', ' 2 000', ' 100', ' 150', ' 50', ' 200', ' 500', ' 250', ' 300', ' 450', ' 1 020', ' 500'],
    // Another aggregation row (Bezirk total)
    ['02', '', '', '', ' 2 000', ' 100', ' 150', ' 50', ' 200', ' 500', ' 250', ' 300', ' 450', ' 1 020', ' 500'],
  ];

  const t2Ws = wb.addWorksheet('T2');
  for (const row of t2Data) {
    t2Ws.addRow(row);
  }

  // Write to buffer
  const buf = await wb.xlsx.writeBuffer();
  return buf;
}

// Build a social atlas GeoJSON mock (provides geometry for PLR areas)
function buildMockSocialAtlasGeojson() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          // ~0.01° square near Berlin center (~52.5°N, 13.3°E)
          coordinates: [[
            [13.3, 52.5],
            [13.31, 52.5],
            [13.31, 52.51],
            [13.3, 52.51],
            [13.3, 52.5],
          ]],
        },
        properties: { plrId: '01100101', plrName: 'Stülerstraße' },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [13.35, 52.5],
            [13.36, 52.5],
            [13.36, 52.51],
            [13.35, 52.51],
            [13.35, 52.5],
          ]],
        },
        properties: { plrId: '01100102', plrName: 'Großer Tiergarten' },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [13.4, 52.52],
            [13.42, 52.52],
            [13.42, 52.54],
            [13.4, 52.54],
            [13.4, 52.52],
          ]],
        },
        properties: { plrId: '02020101', plrName: 'Alexanderplatzviertel' },
      },
    ],
  };
}

describe('ingest-population', () => {
  // Built once rather than in every test. Each Response copies the bytes, so
  // sharing the buffer cannot couple the tests.
  let xlsxBuf: ArrayBuffer;
  beforeAll(async () => {
    xlsxBuf = await buildMockXlsx();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses XLSX and caches PopulationSummary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(xlsxBuf, { status: 200 }),
    );

    const cache = createCache();
    // Seed social atlas geometry
    cache.set('berlin:social-atlas:geojson', buildMockSocialAtlasGeojson(), 86400);

    const ingest = createPopulationIngestion(cache);
    await ingest();

    const summary = cache.get<PopulationSummary>('berlin:population:summary');
    expect(summary).toBeTruthy();
    // Total = 5000 + 3000 + 2000 = 10000
    expect(summary!.total).toBe(10000);
    // Foreign total = 1200 + 800 + 500 = 2500
    expect(summary!.foreignTotal).toBe(2500);
    expect(summary!.foreignPct).toBeCloseTo(25.0, 1);
    // Youth: (300+450+150) + (200+300+100) + (100+150+50) = 900+600+300 = 1800 → 18%
    expect(summary!.youthPct).toBeCloseTo(18.0, 1);
    // Elderly: 650+200+450 = 1300 → 13%
    expect(summary!.elderlyPct).toBeCloseTo(13.0, 1);
    // Working age: total - youth - elderly = 10000-1800-1300 = 6900 → 69%
    expect(summary!.workingAgePct).toBeCloseTo(69.0, 1);
    expect(summary!.snapshotDate).toBeTruthy();
    // City-wide density: total population / sum of PLR polygon areas (should be > 0)
    expect(summary!.density).toBeGreaterThan(0);
  });

  it('caches GeoJSON FeatureCollection with per-PLR properties', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(xlsxBuf, { status: 200 }),
    );

    const cache = createCache();
    cache.set('berlin:social-atlas:geojson', buildMockSocialAtlasGeojson(), 86400);

    const ingest = createPopulationIngestion(cache);
    await ingest();

    const geojson = cache.get<{ type: string; features: Array<{ properties: Record<string, unknown> }> }>('berlin:population:geojson');
    expect(geojson).toBeTruthy();
    expect(geojson!.type).toBe('FeatureCollection');
    // Should have 3 PLR features (skipping aggregation rows)
    expect(geojson!.features).toHaveLength(3);

    const stueler = geojson!.features.find((f) => f.properties.plrId === '01100101');
    expect(stueler).toBeTruthy();
    expect(stueler!.properties.plrName).toBe('Stülerstraße');
    expect(stueler!.properties.population).toBe(5000);
    expect(stueler!.properties.foreignPct).toBeCloseTo(24.0, 1); // 1200/5000
    // Elderly: 650/5000 = 13%
    expect(stueler!.properties.elderlyPct).toBeCloseTo(13.0, 1);
    // Youth: (300+450+150)/5000 = 18%
    expect(stueler!.properties.youthPct).toBeCloseTo(18.0, 1);
    // Density: population / area (should be > 0)
    expect(stueler!.properties.density).toBeGreaterThan(0);
  });

  it('skips aggregation rows (missing PLR column)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(xlsxBuf, { status: 200 }),
    );

    const cache = createCache();
    cache.set('berlin:social-atlas:geojson', buildMockSocialAtlasGeojson(), 86400);

    const ingest = createPopulationIngestion(cache);
    await ingest();

    const geojson = cache.get<{ features: Array<{ properties: Record<string, unknown> }> }>('berlin:population:geojson');
    // Should only have PLR-level features, no aggregation rows
    const plrIds = geojson!.features.map((f) => f.properties.plrId);
    expect(plrIds).toEqual(['01100101', '01100102', '02020101']);
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createPopulationIngestion(cache);
    await ingest(); // should not throw

    expect(cache.get('berlin:population:summary')).toBeNull();
  });

  it('handles network error gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const cache = createCache();
    const ingest = createPopulationIngestion(cache);
    await ingest(); // should not throw

    expect(cache.get('berlin:population:summary')).toBeNull();
  });

  it('parses German space-separated thousands correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(xlsxBuf, { status: 200 }),
    );

    const cache = createCache();
    cache.set('berlin:social-atlas:geojson', buildMockSocialAtlasGeojson(), 86400);

    const ingest = createPopulationIngestion(cache);
    await ingest();

    const summary = cache.get<PopulationSummary>('berlin:population:summary');
    // Values in XLSX have space thousands separators (' 5 000', ' 3 000', ' 2 000')
    expect(summary!.total).toBe(10000);
  });

  it('uses 30-day TTL for cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(xlsxBuf, { status: 200 }),
    );

    const cache = createCache();
    cache.set('berlin:social-atlas:geojson', buildMockSocialAtlasGeojson(), 86400);
    const setSpy = vi.spyOn(cache, 'set');

    const ingest = createPopulationIngestion(cache);
    await ingest();

    // Check that population summary was cached with 30-day TTL (2592000 seconds)
    expect(setSpy).toHaveBeenCalledWith(
      'berlin:population:summary',
      expect.any(Object),
      2592000,
    );
  });

  it('sets change to 0 when no previous snapshot exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(xlsxBuf, { status: 200 }),
    );

    const cache = createCache();
    cache.set('berlin:social-atlas:geojson', buildMockSocialAtlasGeojson(), 86400);

    const ingest = createPopulationIngestion(cache);
    await ingest();

    const summary = cache.get<PopulationSummary>('berlin:population:summary');
    expect(summary!.changeAbsolute).toBe(0);
    expect(summary!.changePct).toBe(0);
  });
});
