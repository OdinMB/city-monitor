import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import type { CrimeAtlasData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { createCrimeAtlasIngestion, CRIME_ATLAS_TTL_SECONDS } from './ingest-crime-atlas.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveCrimeAtlas: (...args: unknown[]) => mockSave(...args),
}));

const HEADER = [
  'LOR-Schlüssel (Bezirksregion)', 'Bezeichnung (Bezirksregion)', 'Straftaten \n-insgesamt-', 'Raub',
  'Körper-verletzungen \n-insgesamt-', 'Fahrrad-\ndiebstahl', 'Wohnraum-\neinbruch', 'Kieztaten',
];

/** A workbook shaped like the Kriminalitätsatlas: an older and a newer year, each with cases and rates. */
async function buildWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Titel').addRow(['Kriminalitätsatlas Berlin']);
  for (const year of [2024, 2025]) {
    for (const [prefix, factor] of [['Fallzahlen', 1], ['HZ', 10]] as const) {
      const ws = wb.addWorksheet(`${prefix}_${year}`);
      ws.addRow([`Gesamtübersicht: Daten zum Kriminalitätsatlas (PKS ${year})`]);
      ws.addRow([]);
      ws.addRow(HEADER);
      ws.addRow(['010000', 'Mitte', 1000 * factor, 10, 100, 50, 20, 300]);
      ws.addRow(['011001', 'Tiergarten Süd', (year === 2025 ? 500 : 400) * factor, 5, 50, 30, 4, 150]);
      ws.addRow(['019900', 'Bezirk (Mi), nicht zuzuordnen', '-', '-', '-', '-', '-', '-']);
      ws.addRow(['999999', 'Berlin (PKS gesamt)', 50000 * factor, 480, 5000, 2200, 1000, 12000]);
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

describe('ingest-crime-atlas', () => {
  let xlsx: ArrayBuffer;
  beforeAll(async () => { xlsx = await buildWorkbook(); });

  beforeEach(() => {
    vi.restoreAllMocks();
    mockSave.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('makes no request for a city without a crime atlas', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(xlsx));
    const cache = createCache();
    await createCrimeAtlasIngestion(cache, {} as Db)();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('caches and stores the newest year on Berlin\'s Bezirksregion outlines', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(xlsx));
    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    await createCrimeAtlasIngestion(cache, {} as Db)();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/fallzahlen_hz-2016-\d{4}\.xlsx$/);
    const data = cache.get<CrimeAtlasData>('berlin:crime-atlas')!;
    expect(data.year).toBe(2025);
    expect(data.city).toMatchObject({ total: 500000, totalCount: 50000 });
    expect(data.geojson.features).toHaveLength(1);
    expect(data.geojson.features[0]!.properties).toMatchObject({ areaId: '011001', district: 'Mitte', total: 5000, totalCount: 500 });
    expect(data.geojson.features[0]!.geometry).toMatchObject({ type: 'Polygon' });
    expect(setSpy).toHaveBeenCalledWith('berlin:crime-atlas', data, CRIME_ATLAS_TTL_SECONDS);
    expect(mockSave).toHaveBeenCalledWith({}, 'berlin', data);
  });

  it('keeps the previous data when the file no longer has the columns', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const wb = new ExcelJS.Workbook();
    for (const name of ['Fallzahlen_2026', 'HZ_2026']) wb.addWorksheet(name).addRow(['LOR-Schlüssel', 'Bezeichnung', 'Straftaten insgesamt']);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(await wb.xlsx.writeBuffer() as ArrayBuffer));
    const cache = createCache();
    await createCrimeAtlasIngestion(cache, {} as Db)();
    expect(cache.get('berlin:crime-atlas')).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('writes nothing when the download fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('gone', { status: 404 }));
    const cache = createCache();
    await createCrimeAtlasIngestion(cache, {} as Db)();
    expect(cache.get('berlin:crime-atlas')).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
