import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import type { TransitAlert } from '@city-monitor/shared';
import { createTransitIngestion, hasTransitSource, ingestsTransit } from './ingest-transit.js';
import { geofoxSignature } from '../lib/geofox.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';
import { koeln } from '../config/cities/koeln.js';

const mockDeparturesResponse = {
  departures: [
    {
      line: { name: 'U2', product: 'subway' },
      stop: {
        name: 'S+U Alexanderplatz Bhf',
        location: { latitude: 52.521508, longitude: 13.411267 },
      },
      remarks: [
        {
          type: 'warning',
          summary: 'U2: Störung zwischen Alexanderplatz und Ruhleben',
          text: 'Wegen einer Signalstörung zwischen Alexanderplatz und Ruhleben kommt es zu Verspätungen von ca. 10 Minuten.',
        },
      ],
    },
    {
      line: { name: 'S1', product: 'suburban' },
      stop: {
        name: 'S+U Friedrichstraße Bhf',
        location: { latitude: 52.520277, longitude: 13.386943 },
      },
      remarks: [
        {
          type: 'warning',
          summary: 'S1: Sperrung Oranienburg – Birkenwerder',
          text: 'Aufgrund von Bauarbeiten gesperrt bis 06:00. Bitte nutzen Sie den Ersatzverkehr mit Bussen.',
        },
      ],
    },
    {
      // Duplicate U2 warning — should be deduped
      line: { name: 'U2', product: 'subway' },
      stop: {
        name: 'S+U Alexanderplatz Bhf',
        location: { latitude: 52.521508, longitude: 13.411267 },
      },
      remarks: [
        {
          type: 'warning',
          summary: 'U2: Störung zwischen Alexanderplatz und Ruhleben',
          text: 'Wegen einer Signalstörung zwischen Alexanderplatz und Ruhleben kommt es zu Verspätungen von ca. 10 Minuten.',
        },
      ],
    },
    {
      // Elevator disruption with detailed text
      line: { name: 'U8', product: 'subway' },
      stop: {
        name: 'S+U Alexanderplatz Bhf',
        location: { latitude: 52.521508, longitude: 13.411267 },
      },
      remarks: [
        {
          type: 'warning',
          summary: 'Aufzug außer Betrieb',
          text: 'Der Aufzug am S+U Alexanderplatz (Straße <> Bahnsteig U2 <> Zwischenebene <> Bahnsteig U5 Richtung Hönow) wird in Kürze repariert.',
        },
      ],
    },
  ],
};

/** Run an async function to completion with fake timers */
async function runWithFakeTimers(fn: () => Promise<void>): Promise<void> {
  const promise = fn();
  // Advance through all inter-station delays (12 stations × 1.5s)
  for (let i = 0; i < 15; i++) {
    await vi.advanceTimersByTimeAsync(2000);
  }
  await promise;
}

describe('ingest-transit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches transit disruptions and writes to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts');
    expect(alerts).toBeTruthy();
    expect(alerts!.length).toBeGreaterThanOrEqual(1);
  });

  it('captures station name and location from departure stop', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    const u2Alert = alerts.find((a) => a.line === 'U2');
    expect(u2Alert).toBeTruthy();
    expect(u2Alert!.station).toBeTruthy();
    expect(u2Alert!.location).toEqual({ lat: 52.521508, lon: 13.411267 });
  });

  it('captures detailed remark text in the detail field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    const elevator = alerts.find((a) => a.message.includes('Aufzug'));
    expect(elevator).toBeTruthy();
    expect(elevator!.detail).toContain('Alexanderplatz');
    expect(elevator!.detail).toContain('Bahnsteig U2');
    // detail should differ from message (summary)
    expect(elevator!.detail).not.toBe(elevator!.message);
  });

  it('deduplicates disruptions from multiple departures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    // U2 disruption appears twice in mock data but should be deduped
    const u2Alerts = alerts.filter((a) => a.line === 'U2');
    expect(u2Alerts).toHaveLength(1);
  });

  it('handles API failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts');
    expect(alerts).toBeNull();
  });

  it('falls back to summary when remark text is empty', async () => {
    const noTextResponse = {
      departures: [
        {
          line: { name: 'U5', product: 'subway' },
          stop: { name: 'S+U Alexanderplatz Bhf', location: { latitude: 52.52, longitude: 13.41 } },
          remarks: [
            { type: 'warning', summary: 'Störung auf der U5', text: '' },
          ],
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(noTextResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].detail).toBe(alerts[0].message);
  });

  it('extracts stops from em-dash range pattern', async () => {
    const dashResponse = {
      departures: [
        {
          line: { name: 'S1', product: 'suburban' },
          stop: { name: 'Test Station', location: { latitude: 52.52, longitude: 13.41 } },
          remarks: [
            { type: 'warning', summary: 'S1: Sperrung Oranienburg – Birkenwerder', text: '' },
          ],
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(dashResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].affectedStops).toHaveLength(2);
    expect(alerts[0].affectedStops[1]).toBe('Birkenwerder');
  });
});

describe('ingest-transit for Hamburg (Geofox)', () => {
  const inForce = {
    summary: 'U3: Störung zwischen Barmbek und Kellinghusenstraße',
    description: 'Wegen einer Weichenstörung fahren die Züge unregelmäßig.',
    validities: [{ begin: '2020-01-01T00:00:00.000+0100' }],
    locations: [{ type: 'SINGLE_LINE', line: { name: 'U3' }, begin: { name: 'Barmbek' }, end: { name: 'Kellinghusenstraße' } }],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('skips Hamburg without both credentials, making no request and logging once', async () => {
    vi.stubEnv('GEOFOX_USER', 'example-user');
    vi.stubEnv('GEOFOX_PASSWORD', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await ingest();
    await ingest();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.get('hamburg:transit:alerts')).toBeNull();
    expect(info.mock.calls.filter((c) => String(c[0]).includes('GEOFOX_USER'))).toHaveLength(1);
  });

  const announcementsOk = () =>
    new Response(JSON.stringify({ returnCode: 'OK', announcements: [inForce], lastUpdate: '2026-11-02T10:00:00.000+0100' }), { status: 200 });
  const stationsOk = () => new Response(JSON.stringify({
    returnCode: 'OK',
    dataReleaseID: '63.11.01',
    stations: [{ id: 'Master:90003', name: 'Barmbek', city: 'Hamburg', coordinate: { x: 10.0445, y: 53.5873, type: 'EPSG_4326' } }],
  }), { status: 200 });

  /** A fetch mock answering by GTI method: getAnnouncements, then listStations as given. */
  function mockGti(stations: () => Response | Promise<Response>) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/listStations') ? stations() : announcementsOk());
  }

  it('posts one signed getAnnouncements request and caches the alerts in force', async () => {
    vi.stubEnv('GEOFOX_USER', 'example-user');
    vi.stubEnv('GEOFOX_PASSWORD', 'test-password');
    const fetchSpy = mockGti(stationsOk);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const cache = createCache();
    await createTransitIngestion(cache)();

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://gti.geofox.de/gti/public/getAnnouncements');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['geofox-auth-user']).toBe('example-user');
    expect(headers['geofox-auth-signature']).toBe(geofoxSignature(String(init?.body), 'test-password'));

    const alerts = cache.get<TransitAlert[]>('hamburg:transit:alerts')!;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ lines: ['U3'], severity: 'high', station: 'Barmbek – Kellinghusenstraße' });
  });

  it('fetches the signed station list once a day and places the alerts with it', async () => {
    vi.stubEnv('GEOFOX_USER', 'example-user');
    vi.stubEnv('GEOFOX_PASSWORD', 'test-password');
    const fetchSpy = mockGti(stationsOk);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await ingest();
    await ingest();

    const stationCalls = fetchSpy.mock.calls.filter(([u]) => String(u) === 'https://gti.geofox.de/gti/public/listStations');
    expect(stationCalls).toHaveLength(1);
    const init = stationCalls[0]![1];
    expect(JSON.parse(String(init?.body))).toMatchObject({ coordinateType: 'EPSG_4326' });
    expect((init?.headers as Record<string, string>)['geofox-auth-signature']).toBe(geofoxSignature(String(init?.body), 'test-password'));

    const alerts = cache.get<TransitAlert[]>('hamburg:transit:alerts')!;
    expect(alerts[0].location).toEqual({ lat: 53.5873, lon: 10.0445 });
  });

  it('still caches the alerts, without locations, when the station list fails', async () => {
    vi.stubEnv('GEOFOX_USER', 'example-user');
    vi.stubEnv('GEOFOX_PASSWORD', 'test-password');
    mockGti(() => { throw new Error('socket hang up'); });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cache = createCache();
    await createTransitIngestion(cache)();

    const alerts = cache.get<TransitAlert[]>('hamburg:transit:alerts')!;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].location).toBeNull();
  });

  it('keeps the cache untouched on an authentication error', async () => {
    vi.stubEnv('GEOFOX_USER', 'example-user');
    vi.stubEnv('GEOFOX_PASSWORD', 'wrong');
    // The body GTI sends for a bad signature (seen on an unauthenticated call, 2026-11-02)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ returnCode: 'ERROR_TEXT', errorText: 'A technical problem occured while processing your request.', errorDevInfo: 'Authentication failed!' }),
      { status: 401 },
    ));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const cache = createCache();
    await createTransitIngestion(cache)();
    expect(cache.get('hamburg:transit:alerts')).toBeNull();
  });
});

describe('hasTransitSource and ingestsTransit', () => {
  it('names Hamburg a transit city by config, ingesting only with credentials', () => {
    expect(hasTransitSource(hamburg)).toBe(true);
    expect(ingestsTransit(hamburg, {})).toBe(false);
    expect(ingestsTransit(hamburg, { GEOFOX_USER: 'u', GEOFOX_PASSWORD: 'p' })).toBe(true);
    expect(ingestsTransit(berlin, {})).toBe(true);
    expect(hasTransitSource(koeln)).toBe(false);
  });
});
