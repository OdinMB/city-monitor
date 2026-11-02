import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { baTableUrl, createLaborMarketIngestion, parseLaborMarketCsv } from './ingest-labor-market.js';
import type { LaborMarketSummary } from '@city-monitor/shared';
import type { Db } from '../db/index.js';

/** BA CSVs recorded on 2026-11-02 (Oktober 2026), byte order mark dropped. */
function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

const mockSaveLaborMarket = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveLaborMarket: (...args: unknown[]) => mockSaveLaborMarket(...args),
}));

// Realistic BA CSV: metadata header, trailing semicolons, copyright footer
const MOCK_CSV = [
  'Land:; Berlin',
  'Gebietsstand:; Februar 2026',
  'Berichtsmonat:; Februar 2026',
  'Datenstand:; Februar 2026',
  'Rechtskreis:; SGB III, SGB II',
  'Hinweis:; Am aktuellen Rand werden vorläufige Daten ausgewiesen.',
  '',
  'Ausgewählte Merkmale;Februar 2026;Januar 2026;Februar 2025;Veränderung Februar 2026 zum Vorjahresmonat absolut;Veränderung Februar 2026 zum Vorjahresmonat in %;',
  'Arbeitslose insgesamt;226.880;228.030;215.420;11.460;5;',
  'im Rechtskreis SGB III;78.280;78.390;71.820;6.460;9;',
  'im Rechtskreis SGB II;148.600;149.650;143.600;5.000;3;',
  'Unterbeschäftigung (ohne Kurzarbeit);272.000;271.950;266.050;5.950;2;',
  'Arbeitslosenquote (bezogen auf alle zivilen Erwerbspersonen);10,6;10,7;10,2;0,4;-;',
  'im Rechtskreis SGB III;3,7;3,7;3,4;0,3;-;',
  'im Rechtskreis SGB II;7,0;7,0;6,8;0,2;-;',
  'Unterbeschäftigungsquote (ohne Kurzarbeit);12,5;12,5;12,3;0,2;-;',
  '© Statistik der Bundesagentur für Arbeit',
  'Aus Gründen der statistischen Geheimhaltung werden die Zahlenwerte gerundet.',
  'Die Produkte unterliegen dem Urheberrecht.',
].join('\n');

describe('ingest-labor-market', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSaveLaborMarket.mockClear();
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const BA = 'https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/csv';

  it('asks the Land table of a city-state and the Kreis table of a kreisfreie Stadt, by the BA spelling', () => {
    expect(baTableUrl({ provider: 'ba', scope: 'bundesland', name: 'Berlin' })).toBe(`${BA}/EckwerteTabelleALOBL?Bundesland=Berlin`);
    expect(baTableUrl({ provider: 'ba', scope: 'kreis', name: 'Köln, Stadt' })).toBe(`${BA}/EckwerteTabelleALOKr?Kreis=K%C3%B6ln%2C%20Stadt`);
    expect(baTableUrl({ provider: 'ba', scope: 'kreis', name: 'München, Landeshauptstadt' }))
      .toBe(`${BA}/EckwerteTabelleALOKr?Kreis=M%C3%BCnchen%2C%20Landeshauptstadt`);
  });

  it('fetches each active city\'s table and writes its rows under its own id', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg,berlin,koeln,muenchen');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(MOCK_CSV, { status: 200 }));

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    const db = {} as Db;
    await createLaborMarketIngestion(cache, db)();

    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([
      `${BA}/EckwerteTabelleALOBL?Bundesland=Hamburg`,
      `${BA}/EckwerteTabelleALOBL?Bundesland=Berlin`,
      `${BA}/EckwerteTabelleALOKr?Kreis=K%C3%B6ln%2C%20Stadt`,
      `${BA}/EckwerteTabelleALOKr?Kreis=M%C3%BCnchen%2C%20Landeshauptstadt`,
    ]);
    expect(setSpy.mock.calls.map((c) => c[0])).toEqual(['hamburg:labor-market', 'berlin:labor-market', 'koeln:labor-market', 'muenchen:labor-market']);
    expect(mockSaveLaborMarket.mock.calls.map((c) => c[1])).toEqual(['hamburg', 'berlin', 'koeln', 'muenchen']);
  });

  it('keeps going with the next city when one city\'s table fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln,muenchen');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('K%C3%B6ln') ? new Response('', { status: 503 }) : new Response(fixture('ba-eckwerte-muenchen.csv'), { status: 200 }));

    const cache = createCache();
    await createLaborMarketIngestion(cache)();

    expect(cache.get('koeln:labor-market')).toBeNull();
    expect(cache.get<LaborMarketSummary>('muenchen:labor-market')!.totalUnemployed).toBe(51690);
  });

  // The Kreis table's metadata line reads "Kreis:;" where the Land table's reads "Land:;"
  it.each([
    ['ba-eckwerte-koeln.csv', { unemploymentRate: 8.9, totalUnemployed: 55980, yoyChangeAbsolute: -360, yoyChangePercent: -1, sgbIIRate: 5.9, sgbIICount: 37260, sgbIIYoyAbsolute: -1500, sgbIIYoyPercent: -4, underemploymentRate: 10.3, underemploymentCount: 65660, underemploymentYoyAbsolute: -460, underemploymentYoyPercent: -1, reportMonth: '2026-10' }],
    ['ba-eckwerte-muenchen.csv', { unemploymentRate: 5.5, totalUnemployed: 51690, yoyChangeAbsolute: 1620, yoyChangePercent: 3, sgbIIRate: 2.6, sgbIICount: 24580, sgbIIYoyAbsolute: 210, sgbIIYoyPercent: 1, underemploymentRate: 6.8, underemploymentCount: 64350, underemploymentYoyAbsolute: 2460, underemploymentYoyPercent: 4, reportMonth: '2026-10' }],
  ])('reads every figure of the recorded Kreis table %s', (file, expected) => {
    expect(parseLaborMarketCsv(fixture(file))).toEqual(expected);
  });

  it('parses BA CSV and caches LaborMarketSummary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(MOCK_CSV, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createLaborMarketIngestion(cache);
    await ingest();

    const summary = cache.get<LaborMarketSummary>('berlin:labor-market');
    expect(summary).toBeTruthy();
    expect(summary!.unemploymentRate).toBe(10.6);
    expect(summary!.totalUnemployed).toBe(226880);
    expect(summary!.sgbIIRate).toBe(7.0);
    expect(summary!.sgbIICount).toBe(148600);
    expect(summary!.yoyChangeAbsolute).toBe(11460);
    expect(summary!.yoyChangePercent).toBe(5);
    expect(summary!.sgbIIYoyAbsolute).toBe(5000);
    expect(summary!.sgbIIYoyPercent).toBe(3);
    expect(summary!.underemploymentRate).toBe(12.5);
    expect(summary!.underemploymentCount).toBe(272000);
    expect(summary!.underemploymentYoyAbsolute).toBe(5950);
    expect(summary!.underemploymentYoyPercent).toBe(2);
  });

  it('extracts report month from CSV header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(MOCK_CSV, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createLaborMarketIngestion(cache);
    await ingest();

    const summary = cache.get<LaborMarketSummary>('berlin:labor-market')!;
    expect(summary.reportMonth).toBe('2026-02');
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createLaborMarketIngestion(cache);
    await ingest(); // should not throw

    expect(cache.get('berlin:labor-market')).toBeNull();
  });

  it('handles empty response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    );

    const cache = createCache();
    const ingest = createLaborMarketIngestion(cache);
    await ingest();

    expect(cache.get('berlin:labor-market')).toBeNull();
  });

  it('uses 1-day TTL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(MOCK_CSV, { status: 200 }),
    );

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    const ingest = createLaborMarketIngestion(cache);
    await ingest();

    expect(setSpy).toHaveBeenCalledWith(
      'berlin:labor-market',
      expect.any(Object),
      86400,
    );
  });

  it('parses German decimal format for rates', async () => {
    const csv = [
      'Ausgewählte Merkmale;März 2026;Februar 2026;März 2025;Veränderung Mär 2026 zum VJM absolut;Veränderung Mär 2026 zum VJM in %',
      'Arbeitslose insgesamt;200.000;210.000;190.000;10.000;5',
      'im Rechtskreis SGB III;70.000;72.000;68.000;2.000;3',
      'im Rechtskreis SGB II;130.000;138.000;122.000;8.000;7',
      'Unterbeschäftigung (ohne Kurzarbeit);250.000;260.000;240.000;10.000;4',
      'Arbeitslosenquote (bezogen auf alle zivilen Erwerbspersonen);9,3;9,8;8,9;0,4;-',
      'im Rechtskreis SGB III;3,3;3,4;3,2;0,1;-',
      'im Rechtskreis SGB II;6,1;6,5;5,7;0,4;-',
      'Unterbeschäftigungsquote (ohne Kurzarbeit);11,7;12,1;11,2;0,5;-',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csv, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createLaborMarketIngestion(cache);
    await ingest();

    const summary = cache.get<LaborMarketSummary>('berlin:labor-market')!;
    expect(summary.unemploymentRate).toBe(9.3);
    expect(summary.sgbIIRate).toBe(6.1);
    expect(summary.underemploymentRate).toBe(11.7);
    expect(summary.underemploymentCount).toBe(250000);
    expect(summary.reportMonth).toBe('2026-03');
  });

  it('treats "-" sentinel as 0 (used by BA for unavailable changes)', async () => {
    // CSV where yoyPercent for count row is "-" instead of a number
    const csv = [
      'Ausgewählte Merkmale;Januar 2026;Dezember 2025;Januar 2025;Veränderung Jan 2026 zum VJM absolut;Veränderung Jan 2026 zum VJM in %',
      'Arbeitslose insgesamt;220.000;225.000;210.000;10.000;-',
      'im Rechtskreis SGB III;75.000;78.000;70.000;5.000;-',
      'im Rechtskreis SGB II;145.000;147.000;140.000;5.000;-',
      'Unterbeschäftigung (ohne Kurzarbeit);260.000;265.000;250.000;10.000;-',
      'Arbeitslosenquote (bezogen auf alle zivilen Erwerbspersonen);10,3;10,5;9,9;0,4;-',
      'im Rechtskreis SGB III;3,5;3,6;3,3;0,2;-',
      'im Rechtskreis SGB II;6,8;6,9;6,6;0,2;-',
      'Unterbeschäftigungsquote (ohne Kurzarbeit);12,1;12,3;11,6;0,5;-',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csv, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createLaborMarketIngestion(cache);
    await ingest();

    const summary = cache.get<LaborMarketSummary>('berlin:labor-market')!;
    expect(summary.yoyChangePercent).toBe(0);
    expect(summary.yoyChangeAbsolute).toBe(10000);
    expect(summary.unemploymentRate).toBe(10.3);
  });

  it('handles network error gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const cache = createCache();
    const ingest = createLaborMarketIngestion(cache);
    await ingest(); // should not throw

    expect(cache.get('berlin:labor-market')).toBeNull();
  });
});
