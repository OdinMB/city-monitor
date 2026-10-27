import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CityConfig } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import { createWeatherIngestion, parseDwdUv, type WeatherData } from './ingest-weather.js';
import * as configModule from '../config/index.js';

const mockCurrentResponse = {
  weather: {
    timestamp: '2026-05-01T12:00:00+00:00',
    temperature: 18.5,
    relative_humidity: 55,
    wind_speed_10: 12.3,
    wind_direction_10: 240,
    precipitation_60: 0.2,
    icon: 'partly-cloudy-day',
    condition: 'dry',
  },
  sources: [],
};

const mockForecastResponse = {
  weather: Array.from({ length: 168 }, (_, i) => ({
    timestamp: new Date(Date.UTC(2026, 4, 1, i)).toISOString(),
    temperature: 15 + (i % 12),
    precipitation: 0,
    precipitation_probability: i < 3 ? null : 20,
    icon: 'clear-day',
  })),
};

// Shape of DWD's uvi.json (opendata.dwd.de/climate_environment/health/alerts/uvi.json):
// one daily-maximum forecast per city for today, tomorrow and the day after.
const dwdUviFixture = {
  sender: 'Deutscher Wetterdienst - Medizin-Meteorologie',
  name: 'UV-Index',
  forecast_day: '2026-05-01',
  last_update: '2026-05-01T09:30',
  next_update: '2026-05-02T09:30',
  content: [
    { city: 'Kiel', forecast: { today: 4, tomorrow: 5, dayafter_to: 5 } },
    { city: 'Hamburg', forecast: { today: 4, tomorrow: 5, dayafter_to: 4 } },
    { city: 'Berlin', forecast: { today: 5, tomorrow: 6, dayafter_to: 4 } },
    { city: 'München', forecast: { today: 6, tomorrow: 6, dayafter_to: 7 } },
  ],
};

// Shape of DWD's warnings.json (JSONP, warnings keyed by warncell id), invented values.
// lib/dwd-warnings.test.ts covers the level mapping and the edge cases.
const dwdWarningsJsonp = `warnWetter.loadWarnings(${JSON.stringify({
  time: Date.UTC(2026, 4, 1, 10),
  warnings: {
    '102000000': [{
      state: 'Hamburg', stateShort: 'HH', regionName: 'Hamburg', type: 2, level: 3,
      start: Date.UTC(2026, 4, 1, 10), end: Date.UTC(2026, 4, 1, 20),
      event: 'DAUERREGEN', headline: 'Amtliche WARNUNG vor DAUERREGEN', description: 'Es tritt Dauerregen auf.',
      instruction: '', altitudeStart: null, altitudeEnd: null,
    }],
    '111000000': [
      {
        state: 'Berlin', stateShort: 'BE', regionName: 'Berlin', type: 1, level: 3,
        start: Date.UTC(2026, 4, 1, 10), end: Date.UTC(2026, 4, 1, 18),
        event: 'STURMBÖEN', headline: 'Amtliche WARNUNG vor STURMBÖEN', description: 'Es treten Sturmböen um 70 km/h auf.',
        instruction: '', altitudeStart: null, altitudeEnd: null,
      },
      {
        state: 'Berlin', stateShort: 'BE', regionName: 'Berlin', type: 1, level: 2,
        start: Date.UTC(2026, 4, 1, 6), end: Date.UTC(2026, 4, 1, 10),
        event: 'WINDBÖEN', headline: 'Amtliche WARNUNG vor WINDBÖEN', description: 'Es treten Windböen um 55 km/h auf.',
        instruction: '', altitudeStart: null, altitudeEnd: null,
      },
    ],
  },
  vorabInformation: {},
  copyright: 'Copyright Deutscher Wetterdienst',
})});`;

function brightSkyMock(input: RequestInfo | URL): Response {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/current_weather')) {
    return new Response(JSON.stringify(mockCurrentResponse), { status: 200 });
  }
  if (url.includes('/weather?')) {
    return new Response(JSON.stringify(mockForecastResponse), { status: 200 });
  }
  if (url.includes('warnings.json')) {
    return new Response(dwdWarningsJsonp, { status: 200 });
  }
  if (url.includes('uvi.json')) {
    return new Response(JSON.stringify(dwdUviFixture), { status: 200 });
  }
  // Open-Meteo air-quality
  if (url.includes('air-quality-api.open-meteo.com')) {
    return new Response(JSON.stringify({
      current: { european_aqi: 40, pm10: 10, pm2_5: 5, nitrogen_dioxide: 8, ozone: 50 },
      hourly: { time: ['2026-05-01T00:00'], european_aqi: [40], pm2_5: [5], pm10: [10] },
    }), { status: 200 });
  }
  throw new Error(`unexpected URL: ${url}`);
}

describe('ingest-weather', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('fetches BrightSky and writes WeatherData to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => brightSkyMock(input));

    const cache = createCache();
    const ingest = createWeatherIngestion(cache);
    await ingest();

    const data = cache.get<WeatherData>('berlin:weather');
    expect(data).toBeTruthy();
    expect(data!.current.temp).toBe(18.5);
    expect(data!.current.humidity).toBe(55);
    expect(typeof data!.current.weatherCode).toBe('number');
    expect(typeof data!.current.feelsLike).toBe('number');
    expect(data!.hourly.length).toBe(168);
    expect(data!.daily.length).toBeGreaterThanOrEqual(7);
    // First three hourlies have null precipitation_probability — must be coerced to 0.
    expect(data!.hourly[0]!.precipProb).toBe(0);
    expect(data!.dwdUv).toEqual({ today: 5, tomorrow: 6, dayAfter: 4, forecastDay: '2026-05-01' });
  });

  it("puts the city's DWD warnings into the weather", async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => brightSkyMock(input));

    const cache = createCache();
    await createWeatherIngestion(cache)();

    expect(cache.get<WeatherData>('berlin:weather')!.alerts).toEqual([{
      headline: 'Amtliche WARNUNG vor STURMBÖEN',
      severity: 'moderate',
      description: 'Es treten Sturmböen um 70 km/h auf.',
      validUntil: '2026-05-01T18:00:00.000Z',
    }]);
  });

  it('still writes the weather, without warnings, when warnings.json is not in the expected shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('warnings.json')) return new Response('warnWetter.loadWarnings({});', { status: 200 });
      return brightSkyMock(input);
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cache = createCache();
    await createWeatherIngestion(cache)();

    const data = cache.get<WeatherData>('berlin:weather');
    expect(data!.current.temp).toBe(18.5);
    expect(data!.alerts).toEqual([]);
    expect(warnSpy.mock.calls.some(([msg]) => typeof msg === 'string' && /berlin.*warnings\.json/.test(msg))).toBe(true);
  });

  it('still writes the weather when the DWD UV forecast fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('uvi.json')) return new Response('gone', { status: 503 });
      return brightSkyMock(input);
    });

    const cache = createCache();
    await createWeatherIngestion(cache)();

    const data = cache.get<WeatherData>('berlin:weather');
    expect(data!.current.temp).toBe(18.5);
    expect(data!.dwdUv).toBeUndefined();
  });

  it('throws when BrightSky returns a non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('api.brightsky.dev')) {
        return new Response('upstream gone', { status: 503 });
      }
      return brightSkyMock(input);
    });

    const cache = createCache();
    const ingest = createWeatherIngestion(cache);
    await expect(ingest()).rejects.toThrow(/503/);
    expect(cache.get<WeatherData>('berlin:weather')).toBeNull();
  });

  describe('multi-city failure aggregation', () => {
    beforeEach(() => {
      vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    });

    it('throws when any city fails, but successful cities still write to cache', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : input.toString();
        // Berlin (lat=52.52) BrightSky calls fail; Hamburg (lat=53.5511) succeeds.
        if (url.includes('api.brightsky.dev') && url.includes('lat=52.52')) {
          return new Response('upstream gone', { status: 502 });
        }
        return brightSkyMock(input);
      });

      const cache = createCache();
      const ingest = createWeatherIngestion(cache);
      await expect(ingest()).rejects.toThrow();

      expect(cache.get<WeatherData>('hamburg:weather')).toBeTruthy();
      expect(cache.get<WeatherData>('berlin:weather')).toBeNull();
    });
  });

  describe('Köln', () => {
    beforeEach(() => {
      vi.stubEnv('ACTIVE_CITIES', 'koeln');
    });

    it('keeps the DWD warnings for the Stadt Köln region only', async () => {
      // warnings.json's shape (see dwdWarningsJsonp above), invented values
      const warnings = {
        time: Date.UTC(2026, 4, 1, 10),
        warnings: {
          '105315000': [{ headline: 'Amtliche WARNUNG vor STURMBÖEN', description: 'Köln', level: 3, end: Date.UTC(2026, 4, 1, 18), regionName: 'Stadt Köln' }],
          '105316000': [{ headline: 'Amtliche WARNUNG vor ORKANBÖEN', description: 'Leverkusen', level: 4, end: Date.UTC(2026, 4, 1, 18), regionName: 'Stadt Leverkusen' }],
        },
        vorabInformation: {},
      };
      const brightSkyUrls: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('api.brightsky.dev')) brightSkyUrls.push(url);
        if (url.includes('warnings.json')) {
          return new Response(`warnWetter.loadWarnings(${JSON.stringify(warnings)});`, { status: 200 });
        }
        return brightSkyMock(input);
      });

      const cache = createCache();
      await createWeatherIngestion(cache)();

      const data = cache.get<WeatherData>('koeln:weather');
      expect(data!.alerts.map((a) => a.headline)).toEqual(['Amtliche WARNUNG vor STURMBÖEN']);
      expect(brightSkyUrls.length).toBeGreaterThan(0);
      expect(brightSkyUrls.every((u) => u.includes('lat=50.9375') && u.includes('lon=6.9603'))).toBe(true);
    });

    it('writes the weather without a UV row when the DWD UV file has no Köln entry', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => brightSkyMock(input));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const cache = createCache();
      await createWeatherIngestion(cache)();

      const data = cache.get<WeatherData>('koeln:weather');
      expect(data!.current.temp).toBe(18.5);
      expect(data!.dwdUv).toBeUndefined();
      expect(cache.get<WeatherData>('berlin:weather')).toBeNull();
    });
  });

  describe('skip-on-unsupported-provider', () => {
    it('logs a warning and continues when a city has no adapter for its provider', async () => {
      const fakeNonDe: CityConfig = {
        id: 'london',
        name: 'London',
        country: 'GB',
        coordinates: { lat: 51.5, lon: -0.12 },
        boundingBox: { north: 51.7, south: 51.3, east: 0.3, west: -0.5 },
        timezone: 'Europe/London',
        languages: ['en'],
        map: { center: [-0.12, 51.5], zoom: 11, minZoom: 9, maxZoom: 17, bounds: [[-0.5, 51.3], [0.3, 51.7]] },
        theme: { accent: '#cf142b' },
        feeds: [],
        dataSources: { weather: { provider: 'open-meteo', lat: 51.5, lon: -0.12 } },
      };

      const berlinReal = configModule.getCityConfig('berlin');
      vi.spyOn(configModule, 'getActiveCities').mockReturnValue([berlinReal!, fakeNonDe]);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => brightSkyMock(input));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const cache = createCache();
      const ingest = createWeatherIngestion(cache);
      await expect(ingest()).resolves.not.toThrow();

      expect(cache.get<WeatherData>('berlin:weather')).toBeTruthy();
      expect(cache.get<WeatherData>('london:weather')).toBeNull();
      const matchingWarns = warnSpy.mock.calls.filter(([msg]) => typeof msg === 'string' && /london.*provider 'open-meteo'/.test(msg));
      expect(matchingWarns).toHaveLength(1);
    });
  });
});

describe('parseDwdUv', () => {
  it('picks the city by name, case-insensitively, with the date of its first day', () => {
    expect(parseDwdUv(dwdUviFixture, 'Berlin')).toEqual({ today: 5, tomorrow: 6, dayAfter: 4, forecastDay: '2026-05-01' });
    expect(parseDwdUv(dwdUviFixture, 'hamburg')).toEqual({ today: 4, tomorrow: 5, dayAfter: 4, forecastDay: '2026-05-01' });
  });

  it('falls back to the date of last_update when forecast_day is missing', () => {
    const { forecast_day: _omit, ...rest } = dwdUviFixture;
    expect(parseDwdUv(rest, 'Berlin')?.forecastDay).toBe('2026-05-01');
  });

  it('leaves forecastDay out when the file carries no date', () => {
    expect(parseDwdUv({ content: dwdUviFixture.content }, 'Berlin')).toEqual({ today: 5, tomorrow: 6, dayAfter: 4 });
  });

  it('accepts numeric strings and zero', () => {
    const json = { forecast_day: '2026-12-21', content: [{ city: 'Berlin', forecast: { today: '0', tomorrow: 1, dayafter_to: '1' } }] };
    expect(parseDwdUv(json, 'Berlin')).toEqual({ today: 0, tomorrow: 1, dayAfter: 1, forecastDay: '2026-12-21' });
  });

  it('returns null when the city is missing', () => {
    expect(parseDwdUv(dwdUviFixture, 'Potsdam')).toBeNull();
  });

  it('returns null when a value is missing or not a number', () => {
    for (const forecast of [
      { today: 5, tomorrow: 6 },
      { today: null, tomorrow: 6, dayafter_to: 4 },
      { today: 'hoch', tomorrow: 6, dayafter_to: 4 },
      { today: -1, tomorrow: 6, dayafter_to: 4 },
    ]) {
      expect(parseDwdUv({ content: [{ city: 'Berlin', forecast }] }, 'Berlin'), JSON.stringify(forecast)).toBeNull();
    }
  });

  it('returns null for payloads without a content array', () => {
    expect(parseDwdUv(null, 'Berlin')).toBeNull();
    expect(parseDwdUv('not json', 'Berlin')).toBeNull();
    expect(parseDwdUv({ content: {} }, 'Berlin')).toBeNull();
    expect(parseDwdUv({ content: [null, 'Berlin', { city: 'Berlin' }] }, 'Berlin')).toBeNull();
  });
});
