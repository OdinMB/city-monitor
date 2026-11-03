import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CitizenReport, CitizenReportData, CitizenReportSource } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import {
  PAGE_SIZE, buildCitizenReportData, createCitizenReportIngestion, fetchOpen311Requests, parseOpen311Request,
  reportGroup, reportStatus, requestPageUrl,
} from './ingest-citizen-reports.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveCitizenReports: (...args: unknown[]) => mockSave(...args),
}));

// Recorded from both Open311 servers on 2026-11-03 (with extensions=true),
// trimmed to a few requests. Description, address, media and replies were
// replaced by fakes, as the real ones carry names and phone numbers.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as Array<Record<string, unknown>>;
const KOELN = fixture('open311-koeln.json');
const MUENCHEN = fixture('open311-muenchen.json');

const KOELN_SOURCE: CitizenReportSource = {
  provider: 'open311', baseUrl: 'https://sags-uns.stadt-koeln.de/georeport/v2', requestUrl: 'https://sags-uns.stadt-koeln.de/node/{nid}',
};
const MUENCHEN_SOURCE: CitizenReportSource = {
  provider: 'open311', baseUrl: 'https://machmuenchenbesser.de/api/georeport/v2', requestUrl: 'https://machmuenchenbesser.de/requests/{id}',
};

describe('reportGroup', () => {
  it.each([
    ['Wilder Müll', 'waste'], ['Altkleidercontainer-Standort vermüllt', 'waste'], ['Mülleimer überfüllt', 'waste'],
    ['Geh- und Radweg verschmutzt', 'waste'], ['Hundekotbeutelspender leer', 'waste'],
    ['Leuchte ausgefallen', 'lighting'], ['Leuchte verschmutzt', 'lighting'], ['Straßenbeleuchtung', 'lighting'], ['Licht in ganzer Straße ausgefallen', 'lighting'],
    ['Kfz-Ampel defekt', 'traffic'], ['Ampel verschmutzt', 'traffic'], ['Zu kurze Grünzeit', 'traffic'], ['Keine grüne Welle', 'traffic'],
    ['Straßenmarkierung', 'traffic'], ['Parkscheinautomat defekt', 'traffic'], ['Verkehrsschild beschädigt', 'traffic'],
    ['Defekte Oberfläche', 'roads'], ['Gully verstopft', 'roads'], ['Straßenablauf / Kanaldeckel klappert', 'roads'], ['Straßenbaustellen', 'roads'],
    ['Kölner Grün', 'green'], ['Spiel- und Bolzplätze', 'green'], ['Park beschädigt', 'green'], ['Bank beschädigt', 'green'], ['Brunnen', 'green'],
    ['Schrott-Kfz', 'vehicles'], ['Schrottfahrräder', 'vehicles'],
    ['Graffiti', 'graffiti'], ['Plakat beschädigt', 'graffiti'], ['Sexistische Werbung', 'graffiti'],
    ['Denkmal beschädigt', 'other'],
  ])('%s → %s', (category, group) => {
    expect(reportGroup(category)).toBe(group);
  });
});

describe('reportStatus and requestPageUrl', () => {
  it('reads "In Bearbeitung" on an open request as in progress; closed stays closed', () => {
    expect(reportStatus('open', 'In Bearbeitung')).toBe('in_progress');
    expect(reportStatus('open', 'Neu')).toBe('open');
    expect(reportStatus('open', null)).toBe('open');
    expect(reportStatus('closed', 'In Bearbeitung')).toBe('closed');
  });

  it('fills the id or node id, and gives no link without the node id the template needs', () => {
    expect(requestPageUrl(KOELN_SOURCE.requestUrl, '26227-2026', '95349')).toBe('https://sags-uns.stadt-koeln.de/node/95349');
    expect(requestPageUrl(KOELN_SOURCE.requestUrl, '26227-2026', null)).toBeNull();
    expect(requestPageUrl(MUENCHEN_SOURCE.requestUrl, '94579-2026', null)).toBe('https://machmuenchenbesser.de/requests/94579-2026');
  });
});

describe('parseOpen311Request', () => {
  it('keeps category, status, dates, a rounded position and the portal link from a Köln request', () => {
    expect(parseOpen311Request(KOELN[2]!, KOELN_SOURCE)).toEqual({
      id: '26227-2026', lat: 50.9149, lon: 6.932, category: 'Schrottfahrräder', group: 'vehicles',
      status: 'in_progress', statusLabel: 'In Bearbeitung',
      requestedAt: '2026-11-02T12:26:50+01:00', updatedAt: '2026-11-02T17:01:17+01:00',
      url: 'https://sags-uns.stadt-koeln.de/node/95349',
    });
  });

  it('takes München\'s status name, with no service code', () => {
    const closed = parseOpen311Request(MUENCHEN[1]!, MUENCHEN_SOURCE)!;
    expect(closed).toMatchObject({ category: 'Park verschmutzt', group: 'waste', status: 'closed', statusLabel: 'Erledigt/Beauftragt' });
    expect(parseOpen311Request(MUENCHEN[0]!, MUENCHEN_SOURCE)).toMatchObject({ status: 'in_progress', url: 'https://machmuenchenbesser.de/requests/94579-2026' });
  });

  it('carries nothing that could name the reporter: no description, address, photo or reply', () => {
    for (const [raw, source] of [...KOELN.map((r) => [r, KOELN_SOURCE] as const), ...MUENCHEN.map((r) => [r, MUENCHEN_SOURCE] as const)]) {
      const text = JSON.stringify(parseOpen311Request(raw, source));
      expect(text).not.toMatch(/Mustermann|Musterfrau|0170|Marienplatz|example|gekürzt|80331/);
    }
  });

  it('skips a request without position, category or a valid date', () => {
    const base = KOELN[0]!;
    expect(parseOpen311Request({ ...base, lat: null }, KOELN_SOURCE)).toBeNull();
    expect(parseOpen311Request({ ...base, lat: 0, long: 0 }, KOELN_SOURCE)).toBeNull();
    expect(parseOpen311Request({ ...base, service_name: '' }, KOELN_SOURCE)).toBeNull();
    expect(parseOpen311Request({ ...base, requested_datetime: 'gestern' }, KOELN_SOURCE)).toBeNull();
    expect(parseOpen311Request({ ...base, lat: '50.9', long: '6.95' }, KOELN_SOURCE)).toMatchObject({ lat: 50.9, lon: 6.95 });
  });
});

describe('buildCitizenReportData', () => {
  const report = (id: string, requestedAt: string, status: CitizenReport['status']): CitizenReport => ({
    id, lat: 50.9, lon: 6.9, category: 'Wilder Müll', group: 'waste', status, statusLabel: null, requestedAt, updatedAt: null, url: null,
  });

  it('lists each report once, newest first, caps them and counts the kept ones by status', () => {
    const data = buildCitizenReportData([
      report('a', '2026-11-01T10:00:00+01:00', 'closed'),
      report('b', '2026-11-02T10:00:00+01:00', 'open'),
      report('c', '2026-11-02T09:30:00Z', 'in_progress'),
      report('b', '2026-11-02T10:00:00+01:00', 'open'),
    ], 14, 2);
    expect(data.reports.map((r) => r.id)).toEqual(['c', 'b']);
    expect(data).toMatchObject({ windowDays: 14, total: 3, counts: { open: 1, in_progress: 1, closed: 0 } });
  });
});

describe('fetchOpen311Requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A page of `n` requests a minute apart from `start`, with ids from `first`. */
  const page = (first: number, n: number, start: string) => Array.from({ length: n }, (_, i) => ({
    service_request_id: `${first + i}-2026`, service_name: 'Wilder Müll', status: 'open', lat: 50.9, long: 6.9,
    requested_datetime: new Date(Date.parse(start) + i * 60_000).toISOString().replace('.000Z', '+00:00'),
  }));

  it('pages on from the newest time of each full page until a short page, keeping each request once', async () => {
    const first = page(1, PAGE_SIZE, '2026-11-01T00:00:00Z');
    const last = first.at(-1)!;
    const second = [last, ...page(PAGE_SIZE + 1, 10, '2026-11-01T04:00:00Z')];
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(first)))
      .mockResolvedValueOnce(new Response(JSON.stringify(second)));

    const result = await fetchOpen311Requests('koeln', KOELN_SOURCE, new Date('2026-11-01T00:00:00Z'), 0);
    expect(result).toHaveLength(PAGE_SIZE + 10);
    const urls = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(urls[0]).toBe('https://sags-uns.stadt-koeln.de/georeport/v2/requests.json?start_date=2026-11-01T00%3A00%3A00Z&limit=200&extensions=true');
    expect(urls[1]).toContain('start_date=2026-11-01T03%3A19%3A00Z');
  });

  it('gives up on the whole window when a page fails or is not a list', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(page(1, PAGE_SIZE, '2026-11-01T00:00:00Z'))))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    expect(await fetchOpen311Requests('koeln', KOELN_SOURCE, new Date('2026-11-01T00:00:00Z'), 0)).toBeNull();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: 'x' })));
    expect(await fetchOpen311Requests('koeln', KOELN_SOURCE, new Date('2026-11-01T00:00:00Z'), 0)).toBeNull();
  });
});

describe('createCitizenReportIngestion', () => {
  beforeEach(() => {
    mockSave.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('asks each city\'s server for the last 14 days and stores the reports', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,koeln,muenchen');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      new Response(JSON.stringify(String(input).includes('machmuenchenbesser') ? MUENCHEN : KOELN)));
    const cache = createCache();
    const db = {} as Db;
    await createCitizenReportIngestion(cache, db, { pauseMs: 0 })();

    expect(fetchSpy.mock.calls.map(([u]) => String(u))).toEqual([
      'https://sags-uns.stadt-koeln.de/georeport/v2/requests.json?start_date=2026-10-20T12%3A00%3A00Z&limit=200&extensions=true',
      'https://machmuenchenbesser.de/api/georeport/v2/requests.json?start_date=2026-10-20T12%3A00%3A00Z&limit=200&extensions=true',
    ]);
    const koeln = cache.get<CitizenReportData>('koeln:citizen-reports')!;
    expect(koeln.reports.map((r) => r.id)).toEqual(['26227-2026', '26198-2026', '26197-2026']);
    expect(koeln.counts).toEqual({ open: 1, in_progress: 1, closed: 1 });
    expect(cache.get<CitizenReportData>('muenchen:citizen-reports')!.reports).toHaveLength(2);
    expect(mockSave).toHaveBeenCalledWith(db, 'koeln', koeln);
    expect(cache.get('berlin:citizen-reports')).toBeNull();
  });

  it('caches every run but writes Postgres at most hourly', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(KOELN)));
    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    const ingest = createCitizenReportIngestion(cache, {} as Db, { pauseMs: 0 });
    await ingest();
    vi.setSystemTime(new Date('2026-11-03T12:15:00Z'));
    await ingest();
    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-11-03T13:00:00Z'));
    await ingest();
    expect(mockSave).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous reports when the server fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 502 }));
    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    await createCitizenReportIngestion(cache, {} as Db, { pauseMs: 0 })();
    expect(setSpy).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('makes no request without a city that has the source', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await createCitizenReportIngestion(createCache())();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
