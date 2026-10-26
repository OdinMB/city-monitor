import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeParty,
  normalizeConstituencyName,
  mandateToRepresentative,
  filterBundestagForCity,
  deduplicateMandates,
  constituencyToBezirk,
  preCacheBezirke,
  createPoliticalIngestion,
} from './ingest-political.js';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';

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
