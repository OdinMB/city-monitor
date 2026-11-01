import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeParty,
  normalizeConstituencyName,
  mandateToRepresentative,
  filterBundestagForCity,
  filterByConstituency,
  unmatchedConstituencies,
  deduplicateMandates,
  constituencyToBezirk,
  preCacheBezirke,
  createPoliticalIngestion,
  PARLIAMENT_CONFIG,
} from './ingest-political.js';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { PoliticalDistrict } from '@city-monitor/shared';
import { readFileSync } from 'node:fs';

/**
 * Recorded abgeordnetenwatch candidacies-mandates answers (2026-11-01), trimmed
 * to the fields the job reads: every mandate whose constituency names Köln or
 * München (Bundestag also Berlin-Mitte), plus a few from elsewhere.
 */
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/abgeordnetenwatch-${name}-mandates.json`, import.meta.url), 'utf8')) as {
    data: Parameters<typeof deduplicateMandates>[0];
    meta: { result: { total: number; count: number } };
  };
const bundestagFixture = fixture('bundestag');
const nrwFixture = fixture('nrw');
const bayernFixture = fixture('bayern');

vi.mock('../db/reads.js', () => ({
  loadPoliticalFetchedAt: vi.fn(),
}));

vi.mock('../db/writes.js', () => ({
  savePoliticalDistricts: vi.fn().mockResolvedValue(undefined),
}));

import { loadPoliticalFetchedAt } from '../db/reads.js';
import { savePoliticalDistricts } from '../db/writes.js';

describe('preCacheBezirke', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Well past the 180-day re-verify threshold for the hardcoded mayors
  function pinClockPastThreshold() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'));
  }

  it.each(['berlin', 'berlin,hamburg'])('caches the Berlin mayors and warns when stale (ACTIVE_CITIES=%s)', (activeCities) => {
    vi.stubEnv('ACTIVE_CITIES', activeCities);
    pinClockPastThreshold();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cache = createCache();
    preCacheBezirke(cache);

    expect(cache.get<unknown[]>('berlin:political:bezirke')).toHaveLength(12);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('Bezirksbuergermeister data was last verified');
  });

  it('caches nothing and does not warn when Berlin is not active', () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    pinClockPastThreshold();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    preCacheBezirke(cache);

    expect(setSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('normalizeParty', () => {
  it('extracts SPD', () => expect(normalizeParty('Fraktion der SPD')).toBe('SPD'));
  it('extracts CDU (checked before CSU)', () => expect(normalizeParty('CDU/CSU - Fraktion')).toBe('CDU'));
  it('extracts Gruene (uppercase)', () => expect(normalizeParty('Fraktion BÜNDNIS 90/DIE GRÜNEN')).toBe('Grüne'));
  it('extracts BSW', () => expect(normalizeParty('Fraktion Bündnis Sahra Wagenknecht - BSW')).toBe('BSW'));
  it('extracts Die Linke', () => expect(normalizeParty('Die Linke')).toBe('Die Linke'));
  it('extracts Fraktionslos (case-insensitive)', () => expect(normalizeParty('fraktionslos')).toBe('Fraktionslos'));
  it('returns unknown party as-is', () => expect(normalizeParty('Piratenpartei')).toBe('Piratenpartei'));
  it('extracts AfD', () => expect(normalizeParty('AfD')).toBe('AfD'));
  it('extracts Freie Wähler', () => expect(normalizeParty('FREIE WÄHLER (Bayern 2023 - 2028)')).toBe('Freie Wähler'));
});

describe('normalizeConstituencyName', () => {
  it('strips number prefix and parenthetical', () => {
    expect(normalizeConstituencyName('78 - Berlin-Steglitz-Zehlendorf (Bundestag 2025 - 2029)'))
      .toBe('Berlin-Steglitz-Zehlendorf');
  });
  it('returns plain name unchanged', () => {
    expect(normalizeConstituencyName('Berlin-Mitte')).toBe('Berlin-Mitte');
  });
  it('strips number prefix and parenthetical, preserves trailing number', () => {
    expect(normalizeConstituencyName('3 - Charlottenburg-Wilmersdorf 1 (Abgeordnetenhaus 2023 - 2028)'))
      .toBe('Charlottenburg-Wilmersdorf 1');
  });
});

// Helper to build minimal AW_Mandate-compatible objects
function makeMandateObj(overrides: {
  id?: number;
  politicianId?: number;
  politicianLabel?: string;
  fractionLabel?: string;
  constituencyLabel?: string;
  listLabel?: string;
} = {}) {
  return {
    id: overrides.id ?? 1,
    label: 'mandate',
    politician: {
      id: overrides.politicianId ?? 1,
      label: overrides.politicianLabel ?? 'Max Mustermann',
      abgeordnetenwatch_url: 'https://example.com',
    },
    ...(overrides.fractionLabel !== undefined
      ? { fraction_membership: [{ fraction: { label: overrides.fractionLabel } }] }
      : {}),
    electoral_data: {
      ...(overrides.constituencyLabel !== undefined
        ? { constituency: { label: overrides.constituencyLabel } }
        : {}),
      ...(overrides.listLabel !== undefined
        ? { electoral_list: { label: overrides.listLabel } }
        : {}),
    },
  };
}

describe('mandateToRepresentative', () => {
  it('converts mandate with constituency to Representative', () => {
    const m = makeMandateObj({
      politicianLabel: 'Erika Muster',
      fractionLabel: 'Fraktion der SPD',
      constituencyLabel: '78 - Berlin-Steglitz-Zehlendorf (Bundestag 2025 - 2029)',
    });
    const rep = mandateToRepresentative(m as any, 'MdB');
    expect(rep).toMatchObject({
      name: 'Erika Muster',
      party: 'SPD',
      role: 'MdB',
      constituency: 'Berlin-Steglitz-Zehlendorf',
    });
  });

  it('defaults party to Parteilos when no fraction_membership', () => {
    const m = makeMandateObj({ politicianLabel: 'Hans Solo' });
    const rep = mandateToRepresentative(m as any, 'MdA');
    expect(rep.party).toBe('Parteilos');
  });

  it('constituency is undefined when no electoral_data.constituency', () => {
    const m = {
      id: 1,
      label: 'mandate',
      politician: { id: 1, label: 'Test', abgeordnetenwatch_url: 'https://example.com' },
      fraction_membership: [{ fraction: { label: 'SPD' } }],
      electoral_data: {},
    };
    const rep = mandateToRepresentative(m as any, 'MdB');
    expect(rep.constituency).toBeUndefined();
  });
});

describe('filterBundestagForCity', () => {
  it('keeps mandates with city name in constituency label', () => {
    const m = makeMandateObj({ constituencyLabel: 'Berlin-Mitte' });
    expect(filterBundestagForCity([m] as any[], 'Berlin')).toHaveLength(1);
  });

  it('keeps mandates with city name in electoral list label', () => {
    const m = makeMandateObj({ listLabel: 'Landesliste Berlin' });
    expect(filterBundestagForCity([m] as any[], 'Berlin')).toHaveLength(1);
  });

  it('drops mandates from other cities', () => {
    const m = makeMandateObj({ constituencyLabel: 'Hamburg-Mitte' });
    expect(filterBundestagForCity([m] as any[], 'Berlin')).toHaveLength(0);
  });

  it('drops mandates with no constituency or list data', () => {
    const m = { id: 1, label: 'x', politician: { id: 1, label: 'X', abgeordnetenwatch_url: '' } };
    expect(filterBundestagForCity([m] as any[], 'Berlin')).toHaveLength(0);
  });

  it('matches case-insensitively', () => {
    const m = makeMandateObj({ constituencyLabel: 'berlin-mitte' });
    expect(filterBundestagForCity([m] as any[], 'Berlin')).toHaveLength(1);
  });
});

describe('deduplicateMandates', () => {
  it('keeps first mandate per politician ID', () => {
    const m1 = makeMandateObj({ politicianId: 1 });
    const m2 = makeMandateObj({ politicianId: 1 });
    expect(deduplicateMandates([m1, m2] as any[])).toHaveLength(1);
  });

  it('keeps all mandates with unique politician IDs', () => {
    const m1 = makeMandateObj({ politicianId: 1 });
    const m2 = makeMandateObj({ politicianId: 2 });
    const m3 = makeMandateObj({ politicianId: 3 });
    expect(deduplicateMandates([m1, m2, m3] as any[])).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateMandates([])).toEqual([]);
  });
});

describe('constituencyToBezirk', () => {
  const bezirke = [
    'Mitte', 'Friedrichshain-Kreuzberg', 'Pankow',
    'Charlottenburg-Wilmersdorf', 'Spandau', 'Steglitz-Zehlendorf',
    'Tempelhof-Sch\u00f6neberg', 'Neuk\u00f6lln', 'Treptow-K\u00f6penick',
    'Marzahn-Hellersdorf', 'Lichtenberg', 'Reinickendorf',
  ];

  it('maps numbered constituency to bezirk', () => {
    expect(constituencyToBezirk('Charlottenburg-Wilmersdorf 3', bezirke)).toBe('Charlottenburg-Wilmersdorf');
  });

  it('handles umlauts', () => {
    expect(constituencyToBezirk('Tempelhof-Sch\u00f6neberg 1', bezirke)).toBe('Tempelhof-Sch\u00f6neberg');
  });

  it('maps Mitte', () => {
    expect(constituencyToBezirk('Mitte 2', bezirke)).toBe('Mitte');
  });

  it('returns null for non-Berlin constituency', () => {
    expect(constituencyToBezirk('Brandenburg 5', bezirke)).toBeNull();
  });

  it('matches case-insensitively', () => {
    expect(constituencyToBezirk('mitte 1', bezirke)).toBe('Mitte');
  });

  it('maps the Abgeordnetenhaus 2026–2031 constituency labels, one per Bezirk', () => {
    // As abgeordnetenwatch labels them for period 176 (recorded 2026-11-01):
    // four-digit numbers from Marzahn-Hellersdorf on, the same "<Bezirk> <n>" names.
    const labels = [
      '101 - Mitte 1 (Berlin 2026 - 2031)',
      '201 - Friedrichshain-Kreuzberg 1 (Berlin 2026 - 2031)',
      '301 - Pankow 1 (Berlin 2026 - 2031)',
      '401 - Charlottenburg-Wilmersdorf 1 (Berlin 2026 - 2031)',
      '501 - Spandau 1 (Berlin 2026 - 2031)',
      '601 - Steglitz-Zehlendorf 1 (Berlin 2026 - 2031)',
      '701 - Tempelhof-Schöneberg 1 (Berlin 2026 - 2031)',
      '801 - Neukölln 1 (Berlin 2026 - 2031)',
      '901 - Treptow-Köpenick 1 (Berlin 2026 - 2031)',
      '1001 - Marzahn-Hellersdorf 1 (Berlin 2026 - 2031)',
      '1101 - Lichtenberg 1 (Berlin 2026 - 2031)',
      '1201 - Reinickendorf 1 (Berlin 2026 - 2031)',
    ];
    expect(labels.map((l) => constituencyToBezirk(normalizeConstituencyName(l), bezirke))).toEqual(bezirke);
  });
});

describe('createPoliticalIngestion — weekly refresh', () => {
  const DAY_MS = 86_400_000;
  const db = {} as Db;
  const previous = [{ id: 'old', name: 'Previous', level: 'bundestag', representatives: [] }];

  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const unavailable = () => new Response('unavailable', { status: 503 });
  const mitteMandate = (politicianId = 1) => makeMandateObj({
    politicianId,
    fractionLabel: 'Fraktion der SPD',
    constituencyLabel: '75 - Berlin-Mitte (Bundestag 2025 - 2029)',
  });
  const onePage = () => ok({ data: [mitteMandate()], meta: { result: { total: 1, count: 1 } } });

  /** Bundestag period 111, Berlin state period 222; `mandates` answers the mandate requests. */
  function mockAbgeordnetenwatch(mandates: (url: string) => Response = onePage) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/parliament-periods')) {
        return ok({ data: [{ id: url.includes('parliament=5&') ? 111 : 222, type: 'legislature' }] });
      }
      return mandates(url);
    });
  }

  const savedLevels = () => vi.mocked(savePoliticalDistricts).mock.calls.map((call) => call[2]);

  beforeEach(() => {
    vi.mocked(loadPoliticalFetchedAt).mockReset();
    vi.mocked(savePoliticalDistricts).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refetches on the weekly run when the last fetch is a few seconds under 7 days old', async () => {
    vi.mocked(loadPoliticalFetchedAt).mockResolvedValue(new Date(Date.now() - 7 * DAY_MS + 30_000));
    const fetchSpy = mockAbgeordnetenwatch();
    const cache = createCache();

    await createPoliticalIngestion(cache, db)();

    expect(fetchSpy).toHaveBeenCalled();
    const bundestag = cache.get<{ name: string }[]>('berlin:political:bundestag');
    expect(bundestag?.map((d) => d.name)).toEqual(['Berlin-Mitte']);
  });

  it('skips the API when the stored data is from the current weekly cycle', async () => {
    vi.mocked(loadPoliticalFetchedAt).mockResolvedValue(new Date(Date.now() - 3600_000));
    const fetchSpy = mockAbgeordnetenwatch();
    const cache = createCache();

    await createPoliticalIngestion(cache, db)();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the previous data when a later mandates page fails', async () => {
    vi.mocked(loadPoliticalFetchedAt).mockResolvedValue(new Date(Date.now() - 8 * DAY_MS));
    const firstPage = Array.from({ length: 100 }, (_, i) => mitteMandate(i + 1));
    mockAbgeordnetenwatch((url) => url.includes('range_start=0&')
      ? ok({ data: firstPage, meta: { result: { total: 250, count: 100 } } })
      : unavailable());
    const cache = createCache();
    cache.set('berlin:political:bundestag', previous, 604800);
    cache.set('berlin:political:state', previous, 604800);

    await createPoliticalIngestion(cache, db)();

    expect(cache.get('berlin:political:bundestag')).toEqual(previous);
    expect(cache.get('berlin:political:state')).toEqual(previous);
    expect(savedLevels()).toEqual(['bezirke']);
  });

  it('updates the Bundestag but keeps the previous state data when the state fetch fails', async () => {
    vi.mocked(loadPoliticalFetchedAt).mockResolvedValue(new Date(Date.now() - 8 * DAY_MS));
    mockAbgeordnetenwatch((url) => (url.includes('parliament_period=111&') ? onePage() : unavailable()));
    const cache = createCache();
    cache.set('berlin:political:state', previous, 604800);
    cache.set('berlin:political:state-bezirke', previous, 604800);

    await createPoliticalIngestion(cache, db)();

    const bundestag = cache.get<{ name: string }[]>('berlin:political:bundestag');
    expect(bundestag?.map((d) => d.name)).toEqual(['Berlin-Mitte']);
    expect(cache.get('berlin:political:state')).toEqual(previous);
    expect(cache.get('berlin:political:state-bezirke')).toEqual(previous);
    expect(savedLevels()).toEqual(['bezirke', 'bundestag']);
  });
});

// Looked up on abgeordnetenwatch (parliaments 4 and 13; Bundestag 2025,
// Landtag NRW 2022 and Bayern 2023 constituencies) on 2026-11-01. Each name
// must match the API's label after normalizeConstituencyName, or the city loses
// that constituency's members without an error (only a log line).
describe('PARLIAMENT_CONFIG for cities inside a state', () => {
  it('pins Köln to its Bundestag and Landtag NRW constituencies', () => {
    expect(PARLIAMENT_CONFIG.koeln).toEqual({
      bundestag: { parliamentId: 5, role: 'MdB' },
      state: { parliamentId: 4, role: 'MdL', label: 'Landtag Nordrhein-Westfalen' },
      constituencies: {
        bundestag: ['Köln I', 'Köln II', 'Köln III', 'Leverkusen – Köln IV'],
        state: ['Köln I', 'Köln II', 'Köln III', 'Köln IV', 'Köln V', 'Köln VI', 'Köln VII'],
      },
    });
  });

  it('pins München to its Bundestag constituencies and its nine Stimmkreise', () => {
    expect(PARLIAMENT_CONFIG.muenchen).toEqual({
      bundestag: { parliamentId: 5, role: 'MdB', unionParty: 'CSU' },
      state: { parliamentId: 13, role: 'MdL', label: 'Bayerischer Landtag' },
      constituencies: {
        bundestag: ['München-Nord', 'München-Ost', 'München-Süd', 'München-West/Mitte'],
        state: [
          'München-Hadern', 'München-Bogenhausen', 'München-Giesing', 'München-Milbertshofen', 'München-Moosach',
          'München-Pasing', 'München-Ramersdorf', 'München-Schwabing', 'München-Mitte',
        ],
      },
    });
  });

  it('keeps the city-states on the whole state parliament', () => {
    expect(PARLIAMENT_CONFIG.berlin!.constituencies).toBeUndefined();
    expect(PARLIAMENT_CONFIG.hamburg!.constituencies).toBeUndefined();
  });

  it.each([
    ['koeln', 'bundestag', bundestagFixture],
    ['koeln', 'state', nrwFixture],
    ['muenchen', 'bundestag', bundestagFixture],
    ['muenchen', 'state', bayernFixture],
  ] as const)('finds a recorded mandate in every %s %s constituency', (cityId, parliament, recorded) => {
    expect(unmatchedConstituencies(recorded.data, PARLIAMENT_CONFIG[cityId]!.constituencies![parliament])).toEqual([]);
  });
});

describe('filterByConstituency', () => {
  const names = (mandates: ReturnType<typeof filterByConstituency>) => mandates.map((m) => m.politician.label).sort();

  it('keeps constituency winners and list members who stood in the city, and nobody from its Land list elsewhere', () => {
    const koeln = filterByConstituency(bundestagFixture.data, PARLIAMENT_CONFIG.koeln!.constituencies!.bundestag);
    expect(names(koeln)).toEqual([
      'Fabian Jacobi', 'Jochen Haug', 'Karl Lauterbach', 'Katharina Dröge', 'Lea Reisner',
      'Nyke Slawik', 'Rolf Mützenich', 'Sanae Abdi', 'Serap Güler', 'Sven Lehmann',
    ]);
    // A list member of the same Landesliste from Recklinghausen
    expect(names(koeln)).not.toContain('Michael Breilmann');
  });

  it('leaves out the Landkreis named after the city', () => {
    const muenchen = filterByConstituency(bundestagFixture.data, PARLIAMENT_CONFIG.muenchen!.constituencies!.bundestag);
    expect(names(muenchen)).toEqual([
      'Hans Theiss', 'Jamila Anna Schäfer', 'Nicole Gohlke', 'Sebastian Roloff',
      'Stephan Pilsinger', 'Tobias Teich', 'Wolfgang Stefinger', 'Wolfgang Wiehle',
    ]);
    const state = filterByConstituency(bayernFixture.data, PARLIAMENT_CONFIG.muenchen!.constituencies!.state);
    expect(state).toHaveLength(21);
    for (const outside of ['Kerstin Schreyer', 'Maximilian Böltl', 'Claudia Köhler', 'Johanna Schramm']) {
      expect(names(state)).not.toContain(outside);
    }
  });

  it('reports a configured name no mandate stood in', () => {
    expect(unmatchedConstituencies(nrwFixture.data, ['Köln I', 'Köln VIII'])).toEqual(['Köln VIII']);
  });
});

describe('createPoliticalIngestion — cities inside a state', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const PERIODS: Record<string, number> = { 5: 161, 2: 222, 4: 139, 13: 149 };
  const MANDATES: Record<string, unknown> = { 161: bundestagFixture, 139: nrwFixture, 149: bayernFixture };

  beforeEach(() => {
    vi.mocked(loadPoliticalFetchedAt).mockReset();
    vi.mocked(loadPoliticalFetchedAt).mockResolvedValue(null);
    vi.mocked(savePoliticalDistricts).mockClear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/parliament-periods')) {
        return ok({ data: [{ id: PERIODS[url.searchParams.get('parliament')!], type: 'legislature' }] });
      }
      return ok(MANDATES[url.searchParams.get('parliament_period')!] ?? { data: [], meta: { result: { total: 0, count: 0 } } });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const reps = (districts: PoliticalDistrict[] | null | undefined) => (districts ?? []).flatMap((d) => d.representatives);

  it('gives Köln its Bundestag and Landtag members by constituency, its Oberbürgermeister and its Bezirksbürgermeister', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const cache = createCache();
    await createPoliticalIngestion(cache, {} as Db)();

    const bundestag = cache.get<PoliticalDistrict[]>('koeln:political:bundestag');
    expect(bundestag?.map((d) => d.name).sort()).toEqual(['Köln I', 'Köln II', 'Köln III', 'Leverkusen – Köln IV']);
    expect(reps(bundestag)).toHaveLength(10);
    expect(new Set(reps(bundestag).map((r) => r.role))).toEqual(new Set(['MdB']));

    const state = cache.get<PoliticalDistrict[]>('koeln:political:state');
    expect(state?.map((d) => d.name).sort()).toEqual(['Köln I', 'Köln II', 'Köln III', 'Köln IV', 'Köln V', 'Köln VI', 'Köln VII']);
    expect(reps(state)).toHaveLength(11);
    expect(reps(state).find((r) => r.name === 'Jochen Ott')).toMatchObject({ party: 'SPD', role: 'MdL', constituency: 'Köln III' });

    expect(reps(cache.get<PoliticalDistrict[]>('koeln:political:mayor'))).toEqual([
      expect.objectContaining({ name: 'Torsten Burmester', party: 'SPD', role: 'Oberbürgermeister' }),
    ]);
    expect(cache.get<PoliticalDistrict[]>('koeln:political:bezirke')?.map((d) => d.name)).toEqual([
      'Innenstadt', 'Rodenkirchen', 'Lindenthal', 'Ehrenfeld', 'Nippes', 'Chorweiler', 'Porz', 'Kalk', 'Mülheim',
    ]);
    // No Bezirk grouping: Köln's Landtag constituencies are not its Stadtbezirke
    expect(cache.get('koeln:political:state-bezirke')).toBeNull();
    expect(vi.mocked(savePoliticalDistricts).mock.calls.map((call) => call[2])).toEqual(['bezirke', 'mayor', 'bundestag', 'state']);
  });

  it('gives München its members without the Landkreis München, and its Oberbürgermeister', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'muenchen');
    const cache = createCache();
    await createPoliticalIngestion(cache, {} as Db)();

    const bundestag = cache.get<PoliticalDistrict[]>('muenchen:political:bundestag');
    expect(bundestag?.map((d) => d.name).sort()).toEqual(['München-Nord', 'München-Ost', 'München-Süd', 'München-West/Mitte']);
    expect(reps(bundestag)).toHaveLength(8);
    // The Bundestag's CDU/CSU group is the CSU in Bavaria
    expect(reps(bundestag).find((r) => r.name === 'Hans Theiss')?.party).toBe('CSU');

    const state = cache.get<PoliticalDistrict[]>('muenchen:political:state');
    expect(state).toHaveLength(9);
    expect(reps(state)).toHaveLength(21);
    expect(reps(state).find((r) => r.name === 'Markus Blume')).toMatchObject({ party: 'CSU', role: 'MdL', constituency: 'München-Ramersdorf' });
    expect(reps(state).find((r) => r.name === 'Michael Piazolo')?.party).toBe('Freie Wähler');

    expect(reps(cache.get<PoliticalDistrict[]>('muenchen:political:mayor'))).toEqual([
      expect.objectContaining({ name: 'Dominik Krause', party: 'Grüne', role: 'Oberbürgermeister' }),
    ]);
    expect(cache.get('muenchen:political:bezirke')).toBeNull();
  });

  it('keeps Berlin on its city-name match: its constituency and Landesliste, nothing from Köln or München', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const cache = createCache();
    await createPoliticalIngestion(cache, {} as Db)();

    const bundestag = cache.get<PoliticalDistrict[]>('berlin:political:bundestag');
    expect(bundestag?.map((d) => d.name)).toEqual(['Berlin-Mitte']);
    expect(reps(bundestag).map((r) => r.name).sort()).toEqual(['Annika Klose', 'Hanna Steinmüller', 'Stella Merendino']);
  });

  it('keeps the previous data when no recorded mandate stands in the configured constituencies', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    MANDATES[161] = { data: bundestagFixture.data.filter((m) => !m.electoral_data?.constituency?.label.includes('Köln')), meta: bundestagFixture.meta };
    const cache = createCache();
    const previous = [{ id: 'old', name: 'Previous', level: 'bundestag', representatives: [] }];
    cache.set('koeln:political:bundestag', previous, 604800);
    try {
      await createPoliticalIngestion(cache, {} as Db)();
    } finally {
      MANDATES[161] = bundestagFixture;
    }
    expect(cache.get('koeln:political:bundestag')).toEqual(previous);
  });
});

describe('preCacheBezirke — cities inside a state', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('caches Köln\'s Bezirksbürgermeister and Oberbürgermeister, and warns with the city\'s page once stale', () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln,muenchen');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-09-01T00:00:00Z'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cache = createCache();
    preCacheBezirke(cache);

    expect(cache.get<unknown[]>('koeln:political:bezirke')).toHaveLength(9);
    expect(cache.get<unknown[]>('koeln:political:mayor')).toHaveLength(1);
    expect(cache.get<unknown[]>('muenchen:political:mayor')).toHaveLength(1);
    expect(cache.get('muenchen:political:bezirke')).toBeNull();
    const warnings = warnSpy.mock.calls.map((call) => String(call[0]));
    expect(warnings).toHaveLength(3);
    expect(warnings.some((w) => w.includes('stadt-koeln.de/politik-und-verwaltung/bezirksvertretungen'))).toBe(true);
    expect(warnings.some((w) => w.includes('stadt.muenchen.de/infos/oberbuergermeister'))).toBe(true);
  });
});
