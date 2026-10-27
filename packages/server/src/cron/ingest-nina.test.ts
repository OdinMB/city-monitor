import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { NinaWarning } from '@city-monitor/shared';
import { createCache, type Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { createNinaRouter } from '../routes/nina.js';
import { mapSeverity, detectSource, isDwdSource, parseDashboardWarning, hasEnded, createNinaIngestion } from './ingest-nina.js';
import type { DashboardWarning } from './ingest-nina.js';

const NINA = 'https://warnung.bund.de/api31';
const HOUR = 3_600_000;
const KEY = 'berlin:nina:warnings';
const realFetch = globalThis.fetch;

/** A dashboard entry in the shape parseDashboardWarning reads, current until six hours from now. */
function entry(id: string, overrides: Partial<DashboardWarning> = {}): DashboardWarning {
  return {
    id,
    version: 1,
    startDate: new Date(Date.now() - HOUR).toISOString(),
    expiresDate: new Date(Date.now() + 6 * HOUR).toISOString(),
    severity: 'Severe',
    type: 'Alert',
    i18nTitle: { de: `Warnung ${id}` },
    ...overrides,
  };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

/**
 * Answers NINA's endpoints: the dashboard with `dashboard` (an HTTP status, a
 * network error, a raw text body, or anything else as JSON), each warning's
 * detail from `details`, and 404 for the rest. Other URLs reach the network
 * stack as usual, so a test can still call its own server.
 */
function stubNina(dashboard: unknown, details: Record<string, unknown> = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.startsWith(NINA)) return realFetch(input, init);
    if (url.startsWith(`${NINA}/dashboard/`)) {
      if (dashboard instanceof Error) throw dashboard;
      if (typeof dashboard === 'number') return new Response('', { status: dashboard });
      if (typeof dashboard === 'string') return new Response(dashboard);
      return json(dashboard);
    }
    const id = url.match(/\/warnings\/(.+)\.json$/)?.[1];
    if (id && id in details) return json(details[id]);
    return new Response('', { status: 404 });
  });
}

interface Row { cityId: string; type: string; data: unknown; fetchedAt: Date }

/**
 * A stand-in for the snapshots table: an insert stamps fetchedAt with the
 * clock, and a select returns the newest rows first, as loadSnapshot's query
 * does. Only Berlin's NINA rows are written to it, so the select ignores its filter.
 */
function snapshotDb() {
  const rows: Row[] = [];
  const newestFirst = () => rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => b.row.fetchedAt.getTime() - a.row.fetchedAt.getTime() || b.i - a.i)
    .map(({ row }) => row);
  const db = {
    insert: () => ({ values: async (row: Omit<Row, 'fetchedAt'>) => { rows.push({ ...row, fetchedAt: new Date() }); } }),
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async (n: number) => newestFirst().slice(0, n) }) }) }) }),
  };
  return { db: db as unknown as Db, rows };
}

const ids = (warnings: unknown) => (warnings as NinaWarning[]).map((w) => w.id);

/** GET /api/berlin/nina from a server started on `db` with `cache` (empty by default, as after a restart). */
async function askServer(db: Db, cache: Cache = createCache()): Promise<{ data: NinaWarning[]; fetchedAt: string | null }> {
  const app = express();
  app.use('/api', createNinaRouter(cache, db));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    const res = await realFetch(`http://127.0.0.1:${port}/api/berlin/nina`);
    return await res.json();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('mapSeverity', () => {
  it('maps "Extreme" to extreme (case-insensitive)', () => {
    expect(mapSeverity('Extreme')).toBe('extreme');
    expect(mapSeverity('EXTREME')).toBe('extreme');
  });

  it('maps "Severe" to severe', () => {
    expect(mapSeverity('Severe')).toBe('severe');
  });

  it('maps "Moderate" to moderate', () => {
    expect(mapSeverity('Moderate')).toBe('moderate');
  });

  it('maps "Minor" to minor', () => {
    expect(mapSeverity('Minor')).toBe('minor');
  });

  it('maps unknown strings to minor', () => {
    expect(mapSeverity('something-else')).toBe('minor');
  });

  it('maps undefined/null to minor', () => {
    expect(mapSeverity(undefined as unknown as string)).toBe('minor');
    expect(mapSeverity(null as unknown as string)).toBe('minor');
  });
});

describe('detectSource', () => {
  it('detects mowas', () => {
    expect(detectSource('mow.xxx')).toBe('mowas');
  });

  it('detects biwapp', () => {
    expect(detectSource('biwapp.xxx')).toBe('biwapp');
  });

  it('detects katwarn', () => {
    expect(detectSource('katwarn.xxx')).toBe('katwarn');
  });

  it('detects dwd', () => {
    expect(detectSource('dwd.xxx')).toBe('dwd');
  });

  it('detects lhp', () => {
    expect(detectSource('lhp.xxx')).toBe('lhp');
  });

  it('detects police', () => {
    expect(detectSource('police.xxx')).toBe('police');
  });

  it('defaults to mowas for unknown prefix', () => {
    expect(detectSource('unknown.xxx')).toBe('mowas');
  });
});

describe('isDwdSource', () => {
  it('returns true for id starting with "dwd."', () => {
    expect(isDwdSource({ id: 'dwd.123', version: 1, startDate: '', severity: '', type: '', i18nTitle: { de: '' } })).toBe(true);
  });

  it('returns true for type containing "dwd" (case-insensitive)', () => {
    expect(isDwdSource({ id: 'other.123', version: 1, startDate: '', severity: '', type: 'DWD-Alert', i18nTitle: { de: '' } })).toBe(true);
  });

  it('returns false for non-DWD warnings', () => {
    expect(isDwdSource({ id: 'mow.123', version: 1, startDate: '', severity: '', type: 'MOWAS', i18nTitle: { de: '' } })).toBe(false);
  });
});

describe('parseDashboardWarning', () => {
  const validWarning: DashboardWarning = {
    id: 'mow.DE-NW-BN-SE030-20210714-30-001',
    version: 2,
    startDate: '2026-01-01T00:00:00Z',
    expiresDate: '2026-01-02T00:00:00Z',
    severity: 'Severe',
    type: 'Alert',
    i18nTitle: { de: 'Warnung vor Hochwasser' },
  };

  it('parses a valid dashboard warning into NinaWarning', () => {
    const result = parseDashboardWarning(validWarning);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(validWarning.id);
    expect(result!.headline).toBe('Warnung vor Hochwasser');
    expect(result!.severity).toBe('severe');
    expect(result!.source).toBe('mowas');
    expect(result!.version).toBe(2);
    expect(result!.startDate).toBe('2026-01-01T00:00:00Z');
    expect(result!.expiresAt).toBe('2026-01-02T00:00:00Z');
  });

  it('returns null when headline (i18nTitle.de) is missing', () => {
    const noHeadline = { ...validWarning, i18nTitle: { de: '' } };
    const result = parseDashboardWarning(noHeadline);
    expect(result).toBeNull();
  });
});

describe('hasEnded', () => {
  const now = Date.parse('2026-10-27T08:00:00Z');

  it('is false before the warning expires', () => {
    expect(hasEnded({ type: 'Alert', expiresAt: '2026-10-27T08:00:01Z' }, now)).toBe(false);
  });

  it('is true from the moment the warning expires', () => {
    expect(hasEnded({ type: 'Alert', expiresAt: '2026-10-27T08:00:00Z' }, now)).toBe(true);
    expect(hasEnded({ type: 'Update', expiresAt: '2026-10-27T07:00:00Z' }, now)).toBe(true);
  });

  it('reads an expiry given with a UTC offset', () => {
    expect(hasEnded({ type: 'Alert', expiresAt: '2026-10-27T09:30:00+02:00' }, now)).toBe(true);
    expect(hasEnded({ type: 'Alert', expiresAt: '2026-10-27T10:30:00+02:00' }, now)).toBe(false);
  });

  it('is true for a warning NINA withdrew (CAP msgType Cancel, in any case)', () => {
    expect(hasEnded({ type: 'Cancel' }, now)).toBe(true);
    expect(hasEnded({ type: 'CANCEL', expiresAt: '2026-10-28T00:00:00Z' }, now)).toBe(true);
  });

  it('is false for a warning with no expiry, or one that is not a date', () => {
    expect(hasEnded({ type: 'Alert' }, now)).toBe(false);
    expect(hasEnded({ type: 'unknown', expiresAt: '' }, now)).toBe(false);
    expect(hasEnded({ type: 'Alert', expiresAt: 'bis auf Weiteres' }, now)).toBe(false);
  });
});

describe('createNinaIngestion', () => {
  beforeEach(() => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('caches and stores the warnings a run finds', async () => {
    stubNina([entry('mow.a')]);
    const cache = createCache();
    const { db, rows } = snapshotDb();

    await createNinaIngestion(cache, db)();

    expect(ids(cache.get(KEY))).toEqual(['mow.a']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cityId: 'berlin', type: 'bbk-nina' });
    expect(ids(rows[0]!.data)).toEqual(['mow.a']);
  });

  it('stores an empty list when NINA lists no warnings, so the last list is no longer the newest', async () => {
    stubNina([]);
    const cache = createCache();
    const { db, rows } = snapshotDb();

    await createNinaIngestion(cache, db)();

    expect(cache.get(KEY)).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cityId: 'berlin', type: 'bbk-nina', data: [] });
  });

  it.each([
    ['an HTTP error', 503],
    ['a network error', new Error('ECONNRESET')],
    ['a body that is not JSON', '<html>Wartungsarbeiten</html>'],
    ['a body that is not a list', { error: 'unavailable' }],
  ])('keeps the last list when the dashboard request fails with %s', async (_, reply) => {
    const last = [parseDashboardWarning(entry('mow.last'))!];
    const cache = createCache();
    cache.set(KEY, last, 600);
    stubNina(reply);
    const { db, rows } = snapshotDb();

    await createNinaIngestion(cache, db)();

    expect(cache.get(KEY)).toEqual(last);
    expect(rows).toEqual([]);
  });

  it('leaves out a warning NINA has withdrawn, whether the dashboard entry or its detail says so', async () => {
    stubNina(
      [
        entry('mow.current'),
        entry('mow.cancel-type', { type: 'Cancel' }),
        entry('mow.cancel-payload', { type: undefined, payload: { type: 'ALERT', data: { msgType: 'Cancel' } } }),
        entry('mow.cancel-detail'),
      ],
      { 'mow.cancel-detail': { msgType: 'Cancel', info: [{ headline: 'Entwarnung' }] } },
    );
    const cache = createCache();
    const { db, rows } = snapshotDb();

    await createNinaIngestion(cache, db)();

    expect(ids(cache.get(KEY))).toEqual(['mow.current']);
    expect(ids(rows[0]!.data)).toEqual(['mow.current']);
  });

  it('leaves out a warning past its expiry, whether the dashboard entry or its detail gives it', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    stubNina(
      [
        entry('mow.current'),
        entry('mow.expired', { expiresDate: past }),
        entry('mow.expired-detail', { expiresDate: undefined }),
      ],
      { 'mow.expired-detail': { info: [{ headline: 'Warnung', expires: past }] } },
    );
    const cache = createCache();
    const { db, rows } = snapshotDb();

    await createNinaIngestion(cache, db)();

    expect(ids(cache.get(KEY))).toEqual(['mow.current']);
    expect(ids(rows[0]!.data)).toEqual(['mow.current']);
  });

  it('takes the expiry from the warning detail when the dashboard entry has none', async () => {
    const later = new Date(Date.now() + 2 * HOUR).toISOString();
    stubNina(
      [entry('mow.a', { expiresDate: undefined }), entry('mow.b')],
      { 'mow.a': { info: [{ expires: later }] }, 'mow.b': { info: [{ expires: later }] } },
    );
    const cache = createCache();

    await createNinaIngestion(cache, null)();

    const [a, b] = cache.get<NinaWarning[]>(KEY)!.sort((x, y) => x.id.localeCompare(y.id));
    expect(a!.expiresAt).toBe(later);
    expect(b!.expiresAt).not.toBe(later);
  });
});

describe('NINA after a restart', () => {
  beforeEach(() => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('serves no warnings when the last run before the restart found none', async () => {
    const { db } = snapshotDb();
    const cache = createCache();
    stubNina([entry('mow.cleared')]);
    await createNinaIngestion(cache, db)();
    stubNina([]);
    await createNinaIngestion(cache, db)();

    const body = await askServer(db);

    expect(body.data).toEqual([]);
    expect(body.fetchedAt).toEqual(expect.any(String));
  });

  it('serves the last warnings found when every run since then failed', async () => {
    const { db } = snapshotDb();
    const cache = createCache();
    stubNina([entry('mow.still-on')]);
    await createNinaIngestion(cache, db)();
    stubNina(503);
    await createNinaIngestion(cache, db)();
    stubNina(new Error('ETIMEDOUT'));
    await createNinaIngestion(cache, db)();

    const body = await askServer(db);

    expect(ids(body.data)).toEqual(['mow.still-on']);
  });

  it('stops serving a stored warning once its expiry has passed, from the database and from the cache', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T06:00:00Z'));
    const { db } = snapshotDb();
    const cache = createCache();
    stubNina([
      entry('mow.until-0605', { expiresDate: '2026-10-27T06:05:00Z' }),
      entry('mow.until-noon', { expiresDate: '2026-10-27T12:00:00Z' }),
    ]);
    await createNinaIngestion(cache, db)();
    stubNina(503);

    // Six minutes on, the run's cache entry still holds both
    vi.setSystemTime(new Date('2026-10-27T06:06:00Z'));
    expect(ids(cache.get(KEY))).toHaveLength(2);
    expect(ids((await askServer(db, cache)).data)).toEqual(['mow.until-noon']);

    // After a restart, with NINA unreachable since the run
    vi.setSystemTime(new Date('2026-10-27T07:30:00Z'));
    expect(ids((await askServer(db)).data)).toEqual(['mow.until-noon']);
  });
});
