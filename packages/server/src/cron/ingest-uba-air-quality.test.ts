import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AirQualityStation } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import {
  createUbaAirQualityIngestion, parseUbaAirQuality, parseUbaStations, toAirQualityStations,
  ubaLocalToIso, ubaWindowQuery,
} from './ingest-uba-air-quality.js';

// Recorded from the UBA Air Data API v4 on 2026-11-03 around 01:10 UTC, trimmed to seven stations
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown;
const STATIONS = fixture('uba-stations.json');
const VALUES = fixture('uba-airquality.json');

describe('parseUbaStations', () => {
  it('reads each station by its code, with position, type and network', () => {
    const stations = parseUbaStations(STATIONS)!;
    expect(stations.size).toBe(7);
    expect(stations.get('DEBE065')).toEqual({
      id: '172', code: 'DEBE065', name: 'Berlin Frankfurter Allee', lat: 52.5141, lon: 13.4699, network: 'BE', setting: 'traffic',
    });
    expect(stations.get('DEBE010')?.setting).toBe('background');
  });

  it('refuses a response without the columns it needs', () => {
    expect(parseUbaStations({ indices: ['station id'], data: {} })).toBeNull();
    expect(parseUbaStations(null)).toBeNull();
  });
});

describe('parseUbaAirQuality', () => {
  it('keeps each station’s latest hour with its index and the four components', () => {
    const readings = parseUbaAirQuality(VALUES)!;
    expect(readings.get('121')).toEqual({ end: '2026-11-02 24:00:00', index: 2, values: { pm25: 13, pm10: 17, o3: 3, no2: 37 } });
    // München Stachus measures no ozone
    expect(readings.get('471')?.values).toEqual({ pm25: 14, pm10: 27, no2: 10 });
  });

  it('gives an empty map for no data and null for a response without data', () => {
    expect(parseUbaAirQuality({ data: {} })?.size).toBe(0);
    expect(parseUbaAirQuality({ request: {} })).toBeNull();
  });

  it('leaves out an index outside 0–4 and negative values', () => {
    const readings = parseUbaAirQuality({ data: { 1: { '2026-11-02 23:00:00': ['2026-11-02 24:00:00', 7, 1, [5, -1, 0, '0'], [1, 20, 1, '1']] } } })!;
    expect(readings.get('1')).toEqual({ end: '2026-11-02 24:00:00', index: null, values: { pm10: 20 } });
  });
});

describe('ubaLocalToIso', () => {
  it('reads hour 24 as midnight of the next day, in winter and summer time', () => {
    expect(ubaLocalToIso('2026-11-02 24:00:00')).toBe('2026-11-02T23:00:00.000Z');
    expect(ubaLocalToIso('2026-07-01 13:00:00')).toBe('2026-07-01T11:00:00.000Z');
  });

  it('gives null for a malformed time', () => {
    expect(ubaLocalToIso('yesterday')).toBeNull();
    expect(ubaLocalToIso('2026-11-02 25:00:00')).toBeNull();
  });
});

describe('ubaWindowQuery', () => {
  it('asks from six hours back to the end of the German day', () => {
    // 01:10 UTC is 02:10 in Berlin; six hours earlier is 20:10 the day before, in the hour ending 21
    expect(ubaWindowQuery(new Date('2026-11-03T01:10:00Z'))).toBe('date_from=2026-11-02&time_from=21&date_to=2026-11-03&time_to=24');
  });
});

describe('toAirQualityStations', () => {
  it('lists the configured stations with a reading, in config order', () => {
    const list = toAirQualityStations(
      ['DEBE068', 'DEBE010', 'DEHH033', 'DEXX999'],
      parseUbaStations(STATIONS)!,
      parseUbaAirQuality(VALUES)!,
    );
    // Flughafen Nord sent nothing; DEXX999 is not in the list
    expect(list.map((s) => s.code)).toEqual(['DEBE068', 'DEBE010']);
    expect(list[0]).toEqual({
      code: 'DEBE068', name: 'Berlin Mitte', lat: 52.5136, lon: 13.4188, setting: 'background', network: 'BE',
      measuredAt: '2026-11-02T23:00:00.000Z', index: 2, no2: 31, pm10: 19, pm25: 14, o3: null,
    });
  });
});

describe('createUbaAirQualityIngestion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('ACTIVE_CITIES', 'berlin,muenchen');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const respond = (stations: unknown, values: unknown, status = 200) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/stations/json')) return new Response(JSON.stringify(stations), { status: 200 });
      if (url.includes('/airquality/json')) return new Response(JSON.stringify(values), { status });
      return new Response('', { status: 404 });
    });

  it('asks UBA twice for all cities and caches each city’s stations', async () => {
    const fetchSpy = respond(STATIONS, VALUES);
    const cache = createCache();
    await createUbaAirQualityIngestion(cache)();

    const urls = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.startsWith('https://luftdaten.umweltbundesamt.de/api/air-data/v4/stations/json?use=airquality'))).toBe(true);
    expect(urls.some((u) => u.startsWith('https://luftdaten.umweltbundesamt.de/api/air-data/v4/airquality/json?date_from='))).toBe(true);

    const berlin = cache.get<AirQualityStation[]>('berlin:air-quality:stations');
    expect(berlin?.map((s) => s.code)).toEqual(['DEBE010', 'DEBE065', 'DEBE068']);
    expect(cache.get<AirQualityStation[]>('muenchen:air-quality:stations')?.map((s) => s.name)).toEqual(['München/Stachus']);
  });

  it('keeps the previous readings when the values cannot be fetched', async () => {
    respond(STATIONS, {}, 503);
    const cache = createCache();
    const previous: AirQualityStation[] = [];
    cache.set('berlin:air-quality:stations', previous, 600);
    await createUbaAirQualityIngestion(cache)();
    expect(cache.get('berlin:air-quality:stations')).toEqual(previous);
    expect(cache.get('muenchen:air-quality:stations')).toBeNull();
  });

  it('fetches nothing when no active city has stations', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const fetchSpy = respond(STATIONS, VALUES);
    const { getActiveCities } = await import('../config/index.js');
    const berlin = getActiveCities()[0]!;
    const saved = berlin.dataSources.airQuality?.ubaStations;
    berlin.dataSources.airQuality!.ubaStations = [];
    try {
      await createUbaAirQualityIngestion(createCache())();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      berlin.dataSources.airQuality!.ubaStations = saved;
    }
  });
});
