import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoilMoistureData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import { responseLines } from '../lib/stream-lines.js';
import type { Db } from '../db/index.js';
import { berlin } from '../config/cities/berlin.js';
import {
  createSoilMoistureIngestion, meanHistory, parseDwdSoilFile, parseWateringCsv, parseWateringLines, stationFileUrl, summarizeWatering,
} from './ingest-soil-moisture.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveSoilMoisture: (...args: unknown[]) => mockSave(...args),
}));

// The DWD's header, and rows trimmed from Berlin-Tempelhof's file of 2026-11-02 (CC BY 4.0)
const HEADER = 'Stationsindex;Datum;TS05;TS10;TS20;TS50;TS100;TSLS05;TSSL05;ZFUMI;ZTKMI;ZTUMI;BFGL01_AG;BFGL02_AG;BFGL03_AG;BFGL04_AG;BFGL05_AG;BFGL06_AG;BFGS_AG;BFGL_AG;BFWS_AG;BFWL_AG;BFMS_AG;BFML_AG;VPGFAO;VPGH;VRGS_AG;VRGL_AG;VRWS_AG;VRWL_AG;VRMS_AG;VRML_AG;eor';
function row(station: string, date: string, sandy: number, loamy: number): string {
  return `          ${station};${date};    8.6;    8.8;    9.3;   10.8;   12.5;    8.5;    8.6;    0;    0;    0;       55;       30;       16;       18;       25;       32;     ${sandy};     ${loamy};     51;     36;     19;     17;      0.6;    0.7;    0.3;    0.3;    0.2;    0.3;    0.1;    0.2;eor                          `;
}
function file(station: string, days: Array<[string, number, number]>): string {
  return [HEADER, ...days.map(([d, s, l]) => row(station, d, s, l)), ''].join('\n');
}

// Rows in the shape of Gieß den Kiez's CSV (CC0)
const CSV_HEADER = 'id;lng;lat;bezirk;art_dtsch;gattung_deutsch;strname;pflanzjahr;timestamp;bewaesserungsmenge_in_liter';
function watering(tree: string, district: string, date: string, litres: number | string): string {
  return `${tree};13.39;52.50;${district};Winter-Linde;Linde;Teststraße;2019.0;${date} 00:00:00+00:00;${litres}`;
}

describe('parseDwdSoilFile', () => {
  it('reads the date and soil moisture under grass on sandy and loamy soil, oldest first', () => {
    const text = file('433', [['20261101', 34, 29], ['20261031', 35, 30]]);
    expect(parseDwdSoilFile(text)).toEqual([
      { date: '2026-10-31', sandy: 35, loamy: 30 },
      { date: '2026-11-01', sandy: 34, loamy: 29 },
    ]);
  });

  it('skips a day with a missing value and short lines', () => {
    const text = file('433', [['20261101', -999, 29], ['20261031', 35, 30]]) + 'garbage\n';
    expect(parseDwdSoilFile(text)).toEqual([{ date: '2026-10-31', sandy: 35, loamy: 30 }]);
  });

  it('throws when a column it reads is gone', () => {
    expect(() => parseDwdSoilFile('Stationsindex;Datum;BFGL_AG\n433;20261101;29')).toThrow(/BFGS_AG/);
  });
});

describe('meanHistory', () => {
  it('averages the stations per day over the days every station has, keeping the last ones', () => {
    const a = [{ date: '2026-10-30', sandy: 50, loamy: 60 }, { date: '2026-10-31', sandy: 40, loamy: 50 }, { date: '2026-11-01', sandy: 30, loamy: 40 }];
    const b = [{ date: '2026-10-31', sandy: 45, loamy: 51 }, { date: '2026-11-01', sandy: 35, loamy: 41 }];
    expect(meanHistory([a, b, []])).toEqual([
      { date: '2026-10-31', sandy: 42.5, loamy: 50.5 },
      { date: '2026-11-01', sandy: 32.5, loamy: 40.5 },
    ]);
    expect(meanHistory([a], 2).map((d) => d.date)).toEqual(['2026-10-31', '2026-11-01']);
    expect(meanHistory([])).toEqual([]);
  });
});

describe('Gieß den Kiez waterings', () => {
  const NOW = new Date('2026-11-03T10:30:00Z');
  const csv = [
    CSV_HEADER,
    watering('t1', 'Pankow', '2026-10-31', '50.0'),
    watering('t1', 'Pankow', '2026-10-20', '20.0'),
    watering('t2', 'Mitte', '2026-10-02', '10.0'),
    watering('t3', 'Mitte', '2026-10-01', '100.0'), // 31 days before: outside the 30
    watering('t4', 'Neukölln', '2026-06-01', '200.0'),
    watering('t5', 'Spandau', '2026-05-01', '5.0'),
    watering('t1', 'Pankow', '2025-07-01', '25.0'),
    watering('t9', 'Pankow', '2026-12-01', '999.0'), // after today: ignored
    watering('t6', 'Mitte', '2026-10-05', '0'), // no amount
    't7;broken',
    '',
  ].join('\r\n');

  it('parses rows with a date and a positive amount', () => {
    const rows = parseWateringCsv(String.fromCharCode(0xfeff) + csv);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ tree: 't1', district: 'Pankow', date: '2026-10-31', litres: 50 });
  });

  it('sums the last 30 days of data, the season, the year before and the top Bezirke', () => {
    expect(summarizeWatering(parseWateringCsv(csv), NOW)).toEqual({
      dataThrough: '2026-10-31',
      last30Days: { litres: 80, waterings: 3, trees: 2 },
      season: { year: 2026, litres: 385, waterings: 6, trees: 5 },
      previousSeason: { year: 2025, litres: 25, waterings: 1, trees: 1 },
      topDistricts: [
        { district: 'Neukölln', litres: 200 },
        { district: 'Mitte', litres: 110 },
        { district: 'Pankow', litres: 70 },
      ],
    });
  });

  it('gives nothing without rows and throws without its columns', () => {
    expect(summarizeWatering([], NOW)).toBeNull();
    expect(() => parseWateringCsv('a;b;c\n1;2;3')).toThrow(/timestamp/);
  });

  it('parses a response streamed in small chunks to the same rows', async () => {
    // 7-byte chunks cut lines, the CRLF pairs and the multi-byte "ö" of Neukölln
    const bytes = Buffer.from(String.fromCharCode(0xfeff) + csv, 'utf8');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(new Uint8Array(bytes.subarray(i, i + 7)));
        controller.close();
      },
    });
    const rows = await parseWateringLines(responseLines(new Response(body)));
    expect(rows).toEqual(parseWateringCsv(csv));
    expect(rows.find((r) => r.tree === 't4')?.district).toBe('Neukölln');
  });
});

describe('createSoilMoistureIngestion', () => {
  beforeEach(() => mockSave.mockClear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const gz = (text: string) => new Response(gzipSync(Buffer.from(text, 'latin1')), { status: 200 });
  const DAYS: Array<[string, number, number]> = [['20261031', 40, 35], ['20261101', 34, 29]];

  function respond(options: { failStation?: string; failCsv?: boolean } = {}) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('giessdenkiez')) {
        return options.failCsv ? new Response('', { status: 500 }) : new Response([CSV_HEADER, watering('t1', 'Pankow', '2026-10-31', '50.0')].join('\n'));
      }
      const m = url.match(/_v2_(\d+)\.txt\.gz$/);
      if (!m || m[1] === options.failStation) return new Response('', { status: 404 });
      return gz(file(m[1]!, DAYS.map(([d, s, l]) => [d, s + Number(m[1]) % 10, l])));
    });
  }

  it('reads every station of each city, and the waterings for Berlin', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,koeln');
    const fetchSpy = respond();
    const cache = createCache();
    const db = {} as Db;
    await createSoilMoistureIngestion(cache, db)();

    const urls = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(urls).toContain(stationFileUrl('433'));
    expect(urls).toContain(stationFileUrl('2667'));
    expect(urls.filter((u) => u.includes('giessdenkiez'))).toHaveLength(1);

    const data = cache.get<SoilMoistureData>('berlin:soil-moisture')!;
    // Stations 433, 403, 400 add 3, 3 and 0 to the sandy values
    expect(data.stations.map((s) => [s.id, s.date, s.sandy])).toEqual([['433', '2026-11-01', 37], ['403', '2026-11-01', 37], ['400', '2026-11-01', 34]]);
    expect(data.history.at(-1)).toEqual({ date: '2026-11-01', sandy: 36, loamy: 29 });
    expect(data.watering!.dataThrough).toBe('2026-10-31');
    expect(mockSave).toHaveBeenCalledWith(db, 'berlin', data);

    const koeln = cache.get<SoilMoistureData>('koeln:soil-moisture')!;
    expect(koeln.watering).toBeNull();
    expect(koeln.stations).toHaveLength(1);
  });

  it('leaves out a failed station, and keeps the last waterings when the CSV fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const cache = createCache();
    respond();
    await createSoilMoistureIngestion(cache)();
    const before = cache.get<SoilMoistureData>('berlin:soil-moisture')!;
    vi.restoreAllMocks();

    respond({ failStation: '403', failCsv: true });
    await createSoilMoistureIngestion(cache)();
    const after = cache.get<SoilMoistureData>('berlin:soil-moisture')!;
    expect(after.stations.map((s) => s.id)).toEqual(['433', '400']);
    expect(after.watering).toEqual(before.watering);
  });

  it('stores nothing when every station fails and nothing came before', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'muenchen');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    const cache = createCache();
    await createSoilMoistureIngestion(cache, {} as Db)();
    expect(cache.get('muenchen:soil-moisture')).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('makes no request without a city that has the source', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const saved = berlin.dataSources.soilMoisture;
    delete berlin.dataSources.soilMoisture;
    try {
      await createSoilMoistureIngestion(createCache())();
    } finally {
      berlin.dataSources.soilMoisture = saved;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
