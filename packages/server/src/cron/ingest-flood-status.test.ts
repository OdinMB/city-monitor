import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FloodStatus } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import { muenchen } from '../config/cities/muenchen.js';
import {
  alertConcernsCity, buildFloodStatus, createFloodStatusIngestion, lhpLocalToIso, lhpUpdated,
  parseLhpAlerts, parseLhpStations, toFloodGauges, type LhpAlert,
} from './ingest-flood-status.js';

// Recorded from the LHP public API on 2026-11-01 (states=BY), trimmed to four gauges
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>;
const STATIONS = fixture('lhp-stations-by.json');
// Recorded the same evening: no warning was active anywhere in Germany
const NO_ALERTS = fixture('lhp-alerts-by.json');

/** A square around a point, as a GeoJSON polygon ring. */
const square = (lon: number, lat: number, d: number) => [[
  [lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d],
]];

/**
 * Warnings in the GeoJSON shape of the alerts endpoint, with the fields of the
 * OpenAPI example (BY_577) but made-up areas: none was active to record.
 */
const ALERTS = {
  ...NO_ALERTS,
  features: [
    {
      kind: 'AlertArea', id: 'BY_577', type: 'Feature',
      geometry: { type: 'Polygon', coordinates: square(10.85, 49.0, 0.2) },
      properties: {
        areaDesc: 'Lkr. Weißenburg-Gunzenhausen', areaType: 'Region',
        alertHeadline: 'Hochwasserwarnung vor Ausuferungen und Überschwemmungen',
        alertLink: 'https://www.hnd.bayern.de', lhpClass: '4', lhpClassName: 'Hochwasser',
      },
    },
    {
      kind: 'AlertArea', id: 'TEST_MUC', type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [square(11.57, 48.14, 0.1)] },
      properties: {
        areaDesc: 'Stadt München', areaType: 'Region',
        alertHeadline: 'Vorwarnung', alertLink: 'https://www.hnd.bayern.de', lhpClass: '2', lhpClassName: 'Vorwarnung',
      },
    },
  ],
};

describe('parseLhpStations', () => {
  it('reads each gauge of the JSON format', () => {
    const stations = parseLhpStations(STATIONS)!;
    expect(stations).toHaveLength(4);
    expect(stations.find((s) => s.id === 'BY_16005701')).toEqual({
      id: 'BY_16005701',
      lon: 11.5968,
      lat: 48.1454,
      lhpClass: 0,
      stateClassName: 'Keine Meldestufe',
      timestamp: '2026-11-01 20:30:00',
      stationLink: 'https://www.hnd.bayern.de/search/go?suche=pegel&id=16005701',
    });
    expect(stations.find((s) => s.id === 'BY_12402007')).toMatchObject({ lhpClass: -1, timestamp: null });
  });

  it('reads the GeoJSON format too', () => {
    const geo = {
      status: 'success',
      features: [{ id: 'BY_1', type: 'Feature', geometry: { type: 'Point', coordinates: [11, 48] }, properties: { lhpClass: 2, stateClassName: 'Meldestufe 2', timestamp: '2026-07-01 10:00:00' } }],
    };
    expect(parseLhpStations(geo)).toEqual([
      { id: 'BY_1', lon: 11, lat: 48, lhpClass: 2, stateClassName: 'Meldestufe 2', timestamp: '2026-07-01 10:00:00', stationLink: null },
    ]);
  });

  it('refuses a response that does not report success', () => {
    expect(parseLhpStations({ status: 'error', data: [] })).toBeNull();
    expect(parseLhpStations({})).toBeNull();
  });
});

describe('lhpUpdated', () => {
  it('takes the response time as given, or null when it is missing or not a time', () => {
    expect(lhpUpdated(STATIONS)).toBe('2026-11-01T20:41:47+01:00');
    expect(lhpUpdated({ update: '2024-10-04T22:03:16+01:00' })).toBe('2024-10-04T22:03:16+01:00');
    expect(lhpUpdated({ updated: 'gestern' })).toBeNull();
    expect(lhpUpdated({})).toBeNull();
  });
});

describe('lhpLocalToIso', () => {
  it('adds the German offset of the day', () => {
    expect(lhpLocalToIso('2026-11-01 20:30:00')).toBe('2026-11-01T20:30:00+01:00');
    expect(lhpLocalToIso('2026-07-01 20:30:00')).toBe('2026-07-01T20:30:00+02:00');
    expect(lhpLocalToIso('2026-07-01 20:30')).toBe('2026-07-01T20:30:00+02:00');
  });

  it('gives null for no or a malformed time', () => {
    expect(lhpLocalToIso(null)).toBeNull();
    expect(lhpLocalToIso('01.11.2026 20:30')).toBeNull();
  });
});

describe('toFloodGauges', () => {
  it('lists the configured gauges in config order with their class', () => {
    const gauges = toFloodGauges(parseLhpStations(STATIONS)!, muenchen.dataSources.floodStatus!);
    expect(gauges).toEqual([
      {
        id: 'BY_16005701', name: 'München', waterBody: 'Isar', upstream: false, floodClass: 0,
        stateLabel: 'Keine Meldestufe', measuredAt: '2026-11-01T20:30:00+01:00',
        url: 'https://www.hnd.bayern.de/search/go?suche=pegel&id=16005701',
      },
      {
        id: 'BY_16004403', name: 'Puppling', waterBody: 'Isar', upstream: true, floodClass: 0,
        stateLabel: 'Keine Meldestufe', measuredAt: '2026-11-01T20:30:00+01:00',
        url: 'https://www.hnd.bayern.de/search/go?suche=pegel&id=16004403',
      },
    ]);
  });

  it('gives a gauge without current data or missing from LHP no class', () => {
    const config = { provider: 'lhp' as const, state: 'BY', stations: [
      { id: 'BY_12402007', name: 'Sebastianskapelle', waterBody: 'Wertach' },
      { id: 'BY_99999999', name: 'Nirgendwo', waterBody: 'Isar' },
    ] };
    const [noData, missing] = toFloodGauges(parseLhpStations(STATIONS)!, config);
    expect(noData).toMatchObject({ floodClass: null, stateLabel: null, measuredAt: null });
    expect(noData!.url).toContain('12402007');
    expect(missing).toMatchObject({ floodClass: null, stateLabel: null, measuredAt: null, url: null });
  });

  it('keeps the state label of a class above 0', () => {
    const stations = parseLhpStations(STATIONS)!.map((s) => (s.id === 'BY_16005701' ? { ...s, lhpClass: 2, stateClassName: 'Meldestufe 2' } : s));
    const [muc] = toFloodGauges(stations, muenchen.dataSources.floodStatus!);
    expect(muc).toMatchObject({ floodClass: 2, stateLabel: 'Meldestufe 2' });
  });
});

describe('parseLhpAlerts', () => {
  it('reads an empty answer as no warnings', () => {
    expect(parseLhpAlerts(NO_ALERTS)).toEqual([]);
  });

  it('reads the warnings of the GeoJSON format, the class as a number', () => {
    const alerts = parseLhpAlerts(ALERTS)!;
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({
      id: 'BY_577', headline: 'Hochwasserwarnung vor Ausuferungen und Überschwemmungen',
      area: 'Lkr. Weißenburg-Gunzenhausen', level: 4, levelName: 'Hochwasser', url: 'https://www.hnd.bayern.de',
    });
    expect(alerts[0]!.geometry?.type).toBe('Polygon');
  });

  it('refuses a response that does not report success', () => {
    expect(parseLhpAlerts({ status: 'error' })).toBeNull();
  });
});

describe('alertConcernsCity', () => {
  const base: LhpAlert = { id: 'X', headline: 'h', area: 'Lkr. Irgendwo', level: 4, levelName: 'Hochwasser', url: null, geometry: null };

  it('takes a region that contains the city centre or one of its gauges', () => {
    expect(alertConcernsCity({ ...base, geometry: { type: 'Polygon', coordinates: square(11.57, 48.14, 0.05) } }, muenchen, [])).toBe(true);
    // A region around the gauge only (11.5968, 48.1454), not the centre
    const aroundGauge = { ...base, geometry: { type: 'Polygon', coordinates: square(11.60, 48.15, 0.01) } };
    expect(alertConcernsCity(aroundGauge, muenchen, [])).toBe(false);
    expect(alertConcernsCity(aroundGauge, muenchen, [[11.5968, 48.1454]])).toBe(true);
  });

  it('leaves out a region with the city in its hole (a Landkreis around a kreisfreie Stadt)', () => {
    const ring = square(11.57, 48.14, 0.3)[0]!;
    const hole = square(11.57, 48.14, 0.1)[0]!;
    expect(alertConcernsCity({ ...base, geometry: { type: 'Polygon', coordinates: [ring, hole] } }, muenchen, [])).toBe(false);
  });

  it('takes a river section with a vertex in the city', () => {
    const line = { type: 'LineString', coordinates: [[11.55, 48.0], [11.58, 48.12], [11.62, 48.2]] };
    expect(alertConcernsCity({ ...base, geometry: line }, muenchen, [])).toBe(true);
    const elsewhere = { type: 'LineString', coordinates: [[12.1, 48.5], [12.7, 48.7]] };
    expect(alertConcernsCity({ ...base, geometry: elsewhere }, muenchen, [])).toBe(false);
  });

  it('without geometry, takes an area named after the city', () => {
    expect(alertConcernsCity({ ...base, area: 'Stadt München' }, muenchen, [])).toBe(true);
    expect(alertConcernsCity(base, muenchen, [])).toBe(false);
  });
});

describe('buildFloodStatus', () => {
  it('keeps the city’s warnings, highest class first, without their geometry', () => {
    const status = buildFloodStatus(muenchen, parseLhpStations(STATIONS)!, parseLhpAlerts(ALERTS)!, '2026-11-01T20:41:47+01:00')!;
    expect(status.updated).toBe('2026-11-01T20:41:47+01:00');
    expect(status.gauges.map((g) => g.id)).toEqual(['BY_16005701', 'BY_16004403']);
    expect(status.alerts).toEqual([
      { id: 'TEST_MUC', headline: 'Vorwarnung', area: 'Stadt München', level: 2, levelName: 'Vorwarnung', url: 'https://www.hnd.bayern.de' },
    ]);
  });

  it('gives null for a city without the source', () => {
    const city = { ...muenchen, dataSources: { ...muenchen.dataSources, floodStatus: undefined } };
    expect(buildFloodStatus(city, [], [], '2026-11-01T20:41:47+01:00')).toBeNull();
  });
});

describe('createFloodStatusIngestion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('ACTIVE_CITIES', 'berlin,muenchen');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const respond = (stations: unknown, alerts: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/data/stations')) return new Response(JSON.stringify(stations), { status: 200 });
      if (url.includes('/data/alerts')) return new Response(JSON.stringify(alerts), { status: 200 });
      return new Response('', { status: 404 });
    });

  it('asks LHP once per state and caches München’s status', async () => {
    const fetchSpy = respond(STATIONS, ALERTS);
    const cache = createCache();
    await createFloodStatusIngestion(cache)();

    const urls = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(urls.sort()).toEqual([
      'https://api.hochwasserzentralen.de/public/v1/data/alerts?states=BY',
      'https://api.hochwasserzentralen.de/public/v1/data/stations?states=BY',
    ]);
    const headers = fetchSpy.mock.calls.map(([, init]) => new Headers(init?.headers));
    expect(headers.map((h) => h.get('accept')).sort()).toEqual(['application/geo+json', 'application/json']);

    const status = cache.get<FloodStatus>('muenchen:flood-status');
    expect(status?.gauges).toHaveLength(2);
    expect(status?.alerts.map((a) => a.id)).toEqual(['TEST_MUC']);
    expect(cache.get('berlin:flood-status')).toBeNull();
  });

  it('keeps the previous status when the warnings cannot be fetched', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/data/alerts')
        ? new Response('', { status: 503 })
        : new Response(JSON.stringify(STATIONS), { status: 200 }));
    const cache = createCache();
    const previous: FloodStatus = { gauges: [], alerts: [], updated: '2026-11-01T20:00:00+01:00' };
    cache.set('muenchen:flood-status', previous, 600);
    await createFloodStatusIngestion(cache)();
    expect(cache.get('muenchen:flood-status')).toEqual(previous);
  });

  it('fetches nothing when no active city has the source', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const fetchSpy = respond(STATIONS, ALERTS);
    await createFloodStatusIngestion(createCache())();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
