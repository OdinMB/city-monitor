import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaterTemperatureData } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import {
  createWaterTemperatureIngestion, parseWasserportalCsv, wasserportalCsvUrl, wasserportalStationUrl,
} from './ingest-water-temperature.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveWaterTemperature: (...args: unknown[]) => mockSave(...args),
}));

// Recorded from the Wasserportal on 2026-11-03 (trimmed): station 5803200
// (Tiefwerder, Havel), whose batch ends at 16:00 and is padded with gaps.
const TIEFWERDER = [
  'Datum;Einzelwert;"Stationsnummer: 5803200";"Stationsname: Tiefwerder";"Gewässer: Havel";"Wasssertemperatur in °C";"Fehlwerte: -777"',
  '"01.11.2026 15:30";11,3',
  '"01.11.2026 15:45";11,2',
  '"01.11.2026 16:00";11,3',
  '"01.11.2026 16:15";-777,0',
  '"01.11.2026 16:30";-777,0',
  '',
].join('\r\n');
// Station 139 (MPS Fischerinsel, Spree), hourly online values
const FISCHERINSEL = [
  'Datum;Einzelwert;"Stationsnummer: 139";"Stationsname: MPS Fischerinsel";"Gewässer: Spree";"Wasssertemperatur in °C";"Fehlwerte: -777"',
  '"03.11.2026 01:00";10,6',
  '"03.11.2026 02:00";10,57',
].join('\n');
const HEADER_ONLY = 'Datum;Einzelwert;"Stationsnummer: 5800312";"Stationsname: Plötzensee";"Gewässer: Plötzensee";"Wasssertemperatur in °C";"Fehlwerte: -777"\n';

const latin1 = (s: string) => new Uint8Array(Buffer.from(s, 'latin1')).buffer;

describe('parseWasserportalCsv', () => {
  it('takes the newest valid value, skipping gaps, with MEZ as the offset', () => {
    expect(parseWasserportalCsv(TIEFWERDER)).toEqual({ temperature: 11.3, measuredAt: '2026-11-01T16:00:00+01:00' });
  });

  it('rounds to a tenth', () => {
    expect(parseWasserportalCsv(FISCHERINSEL)).toEqual({ temperature: 10.6, measuredAt: '2026-11-03T02:00:00+01:00' });
  });

  it('keeps MEZ in summer too: the portal does not switch to summer time', () => {
    expect(parseWasserportalCsv('"29.07.2026 14:15";23,4')?.measuredAt).toBe('2026-07-29T14:15:00+01:00');
  });

  it('returns null for an export with no valid value, or with implausible ones only', () => {
    expect(parseWasserportalCsv(HEADER_ONLY)).toBeNull();
    expect(parseWasserportalCsv('"01.11.2026 16:15";-777,0\n"01.11.2026 16:30";99,0')).toBeNull();
    expect(parseWasserportalCsv('<html>Fehler</html>')).toBeNull();
  });
});

describe('Wasserportal URLs', () => {
  it('asks for single water-temperature values from three days back, as a CSV, in MEZ', () => {
    const url = new URL(wasserportalCsvUrl('139', Date.parse('2026-11-03T23:30:00Z')));
    expect(url.origin + url.pathname).toBe('https://wasserportal.berlin.de/station.php');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      anzeige: 'd', station: '139', thema: 'owt', sreihe: 'ew', smode: 'c', sdatum: '01.11.2026',
    });
  });

  it('links the station page with its temperature chart', () => {
    expect(wasserportalStationUrl('5803500')).toBe('https://wasserportal.berlin.de/station.php?anzeige=g&thema=owt&station=5803500');
  });
});

describe('createWaterTemperatureIngestion', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    fetchMock.mockReset();
    mockSave.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const station = (url: string) => new URL(url).searchParams.get('station');

  it('fetches each configured Berlin station, keeps those with a reading, and stores the result', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const id = station(url);
      if (id === '139') return new Response(latin1(FISCHERINSEL));
      if (id === '5803500') return new Response(latin1(TIEFWERDER));
      return new Response(latin1(HEADER_ONLY));
    });
    const cache = createCache();
    await createWaterTemperatureIngestion(cache, {} as Db, () => Date.parse('2026-11-03T02:10:00Z'))();

    // Berlin's ten stations, nothing for Hamburg
    expect(fetchMock).toHaveBeenCalledTimes(10);
    const data = cache.get<WaterTemperatureData>('berlin:water-temperature')!;
    expect(data.stations.map((s) => s.id)).toEqual(['139', '5803500']);
    expect(data.stations[0]).toEqual({
      id: '139', name: 'Fischerinsel', waterBody: 'Spree', lat: 52.51393, lon: 13.41077,
      temperature: 10.6, measuredAt: '2026-11-03T02:00:00+01:00',
      url: 'https://wasserportal.berlin.de/station.php?anzeige=g&thema=owt&station=139',
    });
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), 'berlin', data);
    expect(cache.get('hamburg:water-temperature')).toBeNull();
  });

  it("keeps a station's last reading when its request fails", async () => {
    const cache = createCache();
    fetchMock.mockImplementation(async (url: string) => new Response(latin1(station(url) === '139' ? FISCHERINSEL : HEADER_ONLY)));
    const ingest = createWaterTemperatureIngestion(cache, null);
    await ingest();

    fetchMock.mockImplementation(async (url: string) => (station(url) === '139' ? new Response('', { status: 503 }) : new Response(latin1(HEADER_ONLY))));
    await ingest();
    expect(cache.get<WaterTemperatureData>('berlin:water-temperature')!.stations.map((s) => [s.id, s.temperature])).toEqual([['139', 10.6]]);
  });

  it('writes nothing when every request fails', async () => {
    const cache = createCache();
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await createWaterTemperatureIngestion(cache, {} as Db)();
    expect(cache.get('berlin:water-temperature')).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
