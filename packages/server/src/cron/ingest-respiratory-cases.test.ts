import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import {
  RKI_IFSG_URLS, buildCaseSeries, buildRespiratoryCases, createRespiratoryCasesIngestion,
  isoWeekLabel, isoWeekMonday, parseIfsgTsv,
} from './ingest-respiratory-cases.js';
import type { RespiratoryCases } from '@city-monitor/shared';
import type { Db } from '../db/index.js';

/**
 * RKI IfSG files recorded on 2026-11-03 (newest week 2026-W43, CC BY 4.0),
 * trimmed to Germany, Berlin and Hamburg from 2026-W30 (influenza, with the
 * 60+ rows of the two Länder) and 2026-W38 (RSV, with two 00-04 rows).
 */
function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}
const FLU = fixture('rki-ifsg-influenza-trimmed.tsv');
const RSV = fixture('rki-ifsg-rsv-trimmed.tsv');

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveRespiratoryCases: (...args: unknown[]) => mockSave(...args),
}));

describe('ISO weeks', () => {
  it('finds the Monday of a week and the week of a date', () => {
    expect(isoWeekMonday('2026-W43').toISOString().slice(0, 10)).toBe('2026-10-19');
    expect(isoWeekMonday('2026-W01').toISOString().slice(0, 10)).toBe('2025-12-29');
    expect(isoWeekMonday('2021-W01').toISOString().slice(0, 10)).toBe('2021-01-04');
    expect(isoWeekLabel(new Date('2026-10-19T00:00:00Z'))).toBe('2026-W43');
    expect(isoWeekLabel(new Date('2025-12-29T00:00:00Z'))).toBe('2026-W01');
    // 2020 had 53 weeks
    expect(isoWeekLabel(new Date('2020-12-28T00:00:00Z'))).toBe('2020-W53');
    expect(isoWeekLabel(new Date('2021-01-04T00:00:00Z'))).toBe('2021-W01');
  });
});

describe('parseIfsgTsv', () => {
  it('keeps the all-ages rows per Land key and the file\'s week range', () => {
    const file = parseIfsgTsv(FLU)!;
    expect(file.firstWeek).toBe('2026-W30');
    expect(file.latestWeek).toBe('2026-W43');
    expect(file.byRegion.get('11')!.get('2026-W43')).toEqual({ cases: 18, incidence: 0.49 });
    expect(file.byRegion.get('02')!.get('2026-W41')).toEqual({ cases: 25, incidence: 1.34 });
    // Hamburg had no case in W30: the influenza file leaves the row out
    expect(file.byRegion.get('02')!.has('2026-W30')).toBe(false);
  });

  it('drops a byte order mark, finds columns by name and rejects a file without them', () => {
    const shuffled = String.fromCodePoint(0xfeff) + 'Region_Id\tMeldewoche\tAltersgruppe\tInzidenz\tFallzahl\tRegion\n11\t2026-W43\t00+\t0.49\t18\tBerlin\n';
    expect(parseIfsgTsv(shuffled)!.byRegion.get('11')!.get('2026-W43')).toEqual({ cases: 18, incidence: 0.49 });
    expect(parseIfsgTsv('Meldewoche\tRegion\tFallzahl\n2026-W43\tBerlin\t18\n')).toBeNull();
    expect(parseIfsgTsv('')).toBeNull();
  });

  it('counts NA incidence as 0', () => {
    const text = 'Meldewoche\tRegion\tRegion_Id\tAltersgruppe\tFallzahl\tInzidenz\n2026-W43\tBerlin\t11\t00+\t3\tNA\n';
    expect(parseIfsgTsv(text)!.byRegion.get('11')!.get('2026-W43')).toEqual({ cases: 3, incidence: 0 });
  });
});

describe('buildCaseSeries', () => {
  const flu = parseIfsgTsv(FLU)!;

  it('gives the latest week, the trend against the week before and 12 weeks of counts', () => {
    expect(buildCaseSeries('Influenza', flu, '11', '2026-W43')).toEqual({
      name: 'Influenza',
      cases: 18,
      incidence: 0.49,
      previousCases: 32,
      trend: 'falling',
      history: [3, 5, 9, 11, 8, 6, 15, 6, 11, 13, 32, 18],
    });
  });

  it('counts a week the file leaves out as zero', () => {
    // Hamburg W32–W43; W37 had one case, W30 (outside the window) none
    expect(buildCaseSeries('Influenza', flu, '02', '2026-W43')!.history).toEqual([2, 2, 12, 14, 8, 1, 9, 6, 12, 25, 20, 16]);
    expect(buildCaseSeries('Influenza', flu, '02', '2026-W31')!.history).toEqual([0, 3]);
  });

  it('starts the history at the file\'s first week rather than padding before it', () => {
    const rsv = parseIfsgTsv(RSV)!;
    const berlin = buildCaseSeries('RSV', rsv, '11', '2026-W43')!;
    expect(berlin.history).toEqual([0, 0, 0, 1, 4, 0]);
    expect(berlin.trend).toBe('gone');
    expect(berlin.cases).toBe(0);
  });

  it('is null for a Land the file has no row for', () => {
    expect(buildCaseSeries('Influenza', flu, '05', '2026-W43')).toBeNull();
  });
});

describe('buildRespiratoryCases', () => {
  it('dates both pathogens by the newest week and the Monday of it', () => {
    const data = buildRespiratoryCases({ Influenza: parseIfsgTsv(FLU)!, RSV: parseIfsgTsv(RSV)! }, '02')!;
    expect(data.week).toBe('2026-W43');
    expect(data.weekStart).toBe('2026-10-19');
    expect(data.pathogens.map((p) => [p.name, p.cases, p.incidence, p.trend])).toEqual([
      ['Influenza', 16, 0.86, 'stable'],
      ['RSV', 3, 0.16, 'stable'], // 3 after 2 is 1.5x, not above it
    ]);
  });

  it('is null without files or without rows for the Land', () => {
    expect(buildRespiratoryCases({}, '11')).toBeNull();
    expect(buildRespiratoryCases({ Influenza: parseIfsgTsv(FLU)! }, '09')).toBeNull();
  });
});

describe('ingest-respiratory-cases', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSave.mockClear();
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg,koeln');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubFetch(responses: Record<string, Response | Error>) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const r = responses[String(input)];
      if (!r) throw new Error(`unexpected ${String(input)}`);
      if (r instanceof Error) throw r;
      return r;
    });
  }

  it('downloads each file once and stores the two city-states, not Köln', async () => {
    const fetchSpy = stubFetch({
      [RKI_IFSG_URLS.Influenza]: new Response(FLU),
      [RKI_IFSG_URLS.RSV]: new Response(RSV),
    });
    const cache = createCache();
    await createRespiratoryCasesIngestion(cache, {} as Db)();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const berlin = cache.get<RespiratoryCases>('berlin:respiratory-cases')!;
    expect(berlin.pathogens.map((p) => p.cases)).toEqual([18, 0]);
    expect(cache.get<RespiratoryCases>('hamburg:respiratory-cases')!.pathogens.map((p) => p.cases)).toEqual([16, 3]);
    expect(cache.get('koeln:respiratory-cases')).toBeNull();
    expect(mockSave.mock.calls.map((c) => c[1])).toEqual(['berlin', 'hamburg']);
  });

  it('keeps the other pathogen when one file fails, and the old data when both do', async () => {
    stubFetch({
      [RKI_IFSG_URLS.Influenza]: new Response(FLU),
      [RKI_IFSG_URLS.RSV]: new Response('', { status: 503 }),
    });
    const cache = createCache();
    await createRespiratoryCasesIngestion(cache)();
    expect(cache.get<RespiratoryCases>('berlin:respiratory-cases')!.pathogens.map((p) => p.name)).toEqual(['Influenza']);

    vi.restoreAllMocks();
    stubFetch({
      [RKI_IFSG_URLS.Influenza]: new Error('network'),
      [RKI_IFSG_URLS.RSV]: new Response('nonsense'),
    });
    await createRespiratoryCasesIngestion(cache)();
    expect(cache.get<RespiratoryCases>('berlin:respiratory-cases')!.pathogens.map((p) => p.name)).toEqual(['Influenza']);
  });
});
