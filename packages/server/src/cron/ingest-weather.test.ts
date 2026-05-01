import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CityConfig } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import { createWeatherIngestion, type WeatherData } from './ingest-weather.js';
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

function brightSkyMock(input: RequestInfo | URL): Response {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/current_weather')) {
    return new Response(JSON.stringify(mockCurrentResponse), { status: 200 });
  }
  if (url.includes('/weather?')) {
    return new Response(JSON.stringify(mockForecastResponse), { status: 200 });
  }
  // DWD alerts (JSONP wrapper) and DWD UV — return harmless empty payloads.
  if (url.includes('warnings.json')) {
    return new Response('warnWetter.loadWarnings({});', { status: 200 });
  }
  if (url.includes('uvi.json')) {
    return new Response(JSON.stringify({ content: [] }), { status: 200 });
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
