import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectricityData, GenerationKind } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { berlin } from '../config/cities/berlin.js';
import {
  buildGrid, buildMix, createElectricityIngestion, parseSmardSeries, SMARD_FILTERS, type SmardSeries,
} from './ingest-electricity.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveElectricity: (...args: unknown[]) => mockSave(...args),
}));

const QH = 15 * 60_000;
// SMARD's week of 2026-11-02 (Monday 00:00 CET) and the one before
const WEEK = 1793574000000;
const PREV_WEEK = WEEK - 7 * 24 * 3600_000;

/** A series of `n` quarter-hours from `start`, each `value` MWh, then nulls up to `length`. */
function series(start: number, n: number, value: number | ((i: number) => number), length = n): SmardSeries {
  return Array.from({ length }, (_, i) => [start + i * QH, i < n ? (typeof value === 'number' ? value : value(i)) : null]);
}

describe('parseSmardSeries', () => {
  it('reads [ms, value] pairs and keeps nulls', () => {
    expect(parseSmardSeries({ meta_data: { version: 1 }, series: [[1, 2.5], [2, null]] })).toEqual([[1, 2.5], [2, null]]);
  });
  it('returns null for a body without series', () => {
    expect(parseSmardSeries([])).toBeNull();
    expect(parseSmardSeries(null)).toBeNull();
  });
});

describe('buildMix', () => {
  it('takes the newest quarter-hour every series has reached, as MW and renewable share', () => {
    const s = new Map<GenerationKind, SmardSeries>([
      ['windOnshore', series(WEEK, 6, 300, 8)], // 1200 MW
      ['solar', series(WEEK, 5, 0, 8)],         // one quarter-hour behind
      ['lignite', series(WEEK, 6, 600, 8)],     // 2400 MW
      ['windOffshore', []],                      // the area has no such series
    ]);
    const { mix, renewableHistory } = buildMix(s);
    expect(mix).toEqual({
      at: new Date(WEEK + 4 * QH).toISOString(),
      mw: { windOnshore: 1200, solar: 0, lignite: 2400 },
      renewableShare: 33.3,
    });
    // Two hours: 00:00 (4 quarter-hours) and 01:00 (the one reached)
    expect(renewableHistory).toEqual([
      { t: new Date(WEEK).toISOString(), share: 33.3 },
      { t: new Date(WEEK + 4 * QH).toISOString(), share: 33.3 },
    ]);
  });

  it('keeps the hourly share to the last 24 hours, oldest first', () => {
    const s = new Map<GenerationKind, SmardSeries>([
      ['solar', series(WEEK, 30 * 4, (i) => (i < 6 * 4 ? 0 : 100))],
      ['gas', series(WEEK, 30 * 4, 100)],
    ]);
    const { renewableHistory } = buildMix(s);
    expect(renewableHistory).toHaveLength(24);
    expect(renewableHistory[0]).toEqual({ t: new Date(WEEK + 6 * 3600_000).toISOString(), share: 50 });
  });

  it('gives no mix when no quarter-hour is complete or nothing was generated', () => {
    expect(buildMix(new Map([['solar', series(WEEK, 0, 0, 4)]]))).toEqual({ mix: null, renewableHistory: [] });
    expect(buildMix(new Map([['solar', series(WEEK, 2, 0)], ['gas', series(WEEK, 2, 0)]])).mix).toBeNull();
  });
});

describe('buildGrid', () => {
  it('merges the signal and CO₂ answers by quarter-hour', () => {
    const grid = buildGrid(
      { unix_seconds: [1793660400, 1793661300], share: [33.33, 34.3], signal: [0, 2], substitute: false },
      { unix_seconds: [1793660400, 1793661300], co2eq: [539.04, null], co2eq_forecast: [530.6, 529.4] },
    );
    expect(grid).toEqual([
      { t: '2026-11-02T23:00:00.000Z', share: 33.3, signal: 0, co2: 539, co2Forecast: 531 },
      { t: '2026-11-02T23:15:00.000Z', share: 34.3, signal: 2, co2: null, co2Forecast: 529 },
    ]);
  });

  it('works with either answer missing and drops an unknown signal level', () => {
    expect(buildGrid({ unix_seconds: [1793660400], share: [40], signal: [7] }, null))
      .toEqual([{ t: '2026-11-02T23:00:00.000Z', share: 40, signal: null, co2: null, co2Forecast: null }]);
    expect(buildGrid(null, null)).toEqual([]);
  });
});

describe('createElectricityIngestion', () => {
  beforeEach(() => mockSave.mockClear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  /**
   * Answers like SMARD and Energy-Charts. `weekQuarterHours` is how far the
   * current SMARD week has got; nuclear and Amprion's offshore wind are 404.
   */
  function respond(weekQuarterHours: number, options: { failFilter?: number; energyCharts?: boolean } = {}) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/signal?')) {
        return options.energyCharts === false ? new Response('', { status: 429 }) : json({ unix_seconds: [1793660400], share: [33.3], signal: [0] });
      }
      if (url.includes('/co2eq?')) return options.energyCharts === false ? new Response('', { status: 429 }) : json({ unix_seconds: [1793660400], co2eq: [539], co2eq_forecast: [530] });
      if (url.includes('index_quarterhour')) return json({ timestamps: [PREV_WEEK, WEEK] });
      const m = url.match(/chart_data\/(\d+)\/(\w+)\/\d+_\w+_quarterhour_(\d+)\.json$/);
      if (!m) return new Response('', { status: 404 });
      const [, filter, area, week] = m;
      if (Number(filter) === options.failFilter) return new Response('', { status: 500 });
      if (filter === '1225' && area === 'Amprion') return new Response('', { status: 404 });
      const wind = SMARD_FILTERS.find(([, f]) => f === Number(filter))![0].startsWith('wind');
      const n = Number(week) === WEEK ? weekQuarterHours : 672;
      return json({ meta_data: { version: 1 }, series: series(Number(week), n, wind ? 100 : 50, 672) });
    });
  }

  it('fetches each control area once and Energy-Charts once for all cities', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg,koeln');
    const fetchSpy = respond(200);
    const cache = createCache();
    const db = {} as Db;
    await createElectricityIngestion(cache, db)();

    const urls = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => u.includes('energy-charts'))).toEqual([
      'https://api.energy-charts.info/signal?country=de',
      'https://api.energy-charts.info/co2eq?country=de',
    ]);
    // One index and 11 series per area; the current week holds more than a day, so no previous week
    expect(urls.filter((u) => u.includes('/50Hertz/'))).toHaveLength(12);
    expect(urls.filter((u) => u.includes('/Amprion/'))).toHaveLength(12);
    expect(urls.some((u) => u.includes(String(PREV_WEEK)))).toBe(false);

    const berlin = cache.get<ElectricityData>('berlin:electricity')!;
    expect(berlin.controlArea).toBe('50Hertz');
    // 2 wind series at 100 MWh and 9 others at 50, of which 4 renewable: 400 of 650
    expect(berlin.mix!.renewableShare).toBe(61.5);
    expect(berlin.mix!.mw.windOffshore).toBe(400);
    expect(berlin.renewableHistory).toHaveLength(24);
    expect(berlin.grid).toEqual([{ t: '2026-11-02T23:00:00.000Z', share: 33.3, signal: 0, co2: 539, co2Forecast: 530 }]);
    expect(cache.get<ElectricityData>('hamburg:electricity')!.mix).toEqual(berlin.mix);
    // Amprion has no offshore wind: 300 of 550
    const koeln = cache.get<ElectricityData>('koeln:electricity')!;
    expect(koeln.mix!.mw.windOffshore).toBeUndefined();
    expect(koeln.mix!.renewableShare).toBe(54.5);
    expect(mockSave).toHaveBeenCalledWith(db, 'koeln', koeln);
  });

  it('reads the previous week too while the current one holds less than a day', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'muenchen');
    const fetchSpy = respond(8);
    const cache = createCache();
    await createElectricityIngestion(cache)();
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes(`_${PREV_WEEK}.json`))).toHaveLength(11);
    const data = cache.get<ElectricityData>('muenchen:electricity')!;
    expect(data.mix!.at).toBe(new Date(WEEK + 7 * QH).toISOString());
    expect(data.renewableHistory).toHaveLength(24);
  });

  it('leaves out an area\'s mix when one of its series fails, and keeps the last run\'s', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const cache = createCache();
    respond(200);
    await createElectricityIngestion(cache)();
    const before = cache.get<ElectricityData>('berlin:electricity')!;
    vi.restoreAllMocks();

    respond(200, { failFilter: 1223, energyCharts: false });
    await createElectricityIngestion(cache)();
    const after = cache.get<ElectricityData>('berlin:electricity')!;
    expect(after.mix).toEqual(before.mix);
    expect(after.grid).toEqual(before.grid);
  });

  it('stores nothing when both sources fail', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    const cache = createCache();
    await createElectricityIngestion(cache, {} as Db)();
    expect(cache.get('berlin:electricity')).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('makes no request without a city that has the source', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const saved = berlin.dataSources.electricity;
    delete berlin.dataSources.electricity;
    try {
      await createElectricityIngestion(createCache())();
    } finally {
      berlin.dataSources.electricity = saved;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
