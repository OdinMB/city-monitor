import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CityConfig } from '@city-monitor/shared';
import {
  fetchBrightSkyForecast,
  iconToWmoCode,
  apparentTemp,
  rollUpDaily,
  type BrightSkyHourly,
} from './brightsky.js';

const berlin: CityConfig = {
  id: 'berlin',
  name: 'Berlin',
  country: 'DE',
  coordinates: { lat: 52.52, lon: 13.405 },
  boundingBox: { north: 52.68, south: 52.34, east: 13.76, west: 13.09 },
  timezone: 'Europe/Berlin',
  languages: ['de', 'en'],
  map: { center: [13.405, 52.52], zoom: 11, minZoom: 9, maxZoom: 17, bounds: [[12.9, 52.3], [13.8, 52.7]] },
  theme: { accent: '#E2001A' },
  feeds: [],
  dataSources: { weather: { provider: 'brightsky', lat: 52.52, lon: 13.405 } },
};

const mockCurrent = {
  weather: {
    timestamp: '2026-05-01T12:00:00+00:00',
    cloud_cover: 25,
    condition: 'dry',
    icon: 'partly-cloudy-day',
    temperature: 18.5,
    relative_humidity: 55,
    wind_speed_10: 12.3,
    wind_direction_10: 240,
    precipitation_60: 0.2,
  },
  sources: [],
};

function makeHour(timestampUtc: string, overrides: Partial<BrightSkyHourly> = {}): BrightSkyHourly {
  return {
    timestamp: timestampUtc,
    temperature: 10,
    precipitation: 0,
    precipitation_probability: 0,
    icon: 'clear-day',
    ...overrides,
  };
}

describe('iconToWmoCode', () => {
  it('maps every BrightSky icon to a recognized WMO code', () => {
    const icons = [
      'clear-day', 'clear-night',
      'partly-cloudy-day', 'partly-cloudy-night',
      'cloudy', 'fog', 'wind',
      'rain', 'snow', 'sleet', 'hail', 'thunderstorm',
    ];
    const recognized = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
    for (const icon of icons) {
      const code = iconToWmoCode(icon);
      expect(recognized.has(code), `icon ${icon} → ${code} not in WMO_CODES`).toBe(true);
    }
  });

  it('throws on unknown icon to surface BrightSky enum changes', () => {
    expect(() => iconToWmoCode('not-a-real-icon')).toThrow(/unknown.*icon/i);
  });
});

describe('apparentTemp', () => {
  it('stays within a few degrees of real temp for moderate conditions', () => {
    // 20°C, 50% RH, 5 km/h wind — apparent temp should be close to (a bit below) 20.
    const at = apparentTemp(20, 50, 5);
    expect(at).toBeGreaterThan(17);
    expect(at).toBeLessThan(21);
  });

  it('cools for cold + windy conditions', () => {
    // 5°C, 40% RH, 25 km/h wind → notably colder
    const at = apparentTemp(5, 40, 25);
    expect(at).toBeLessThan(5);
  });

  it('warms for hot + humid conditions', () => {
    // 30°C, 80% RH, 5 km/h wind → notably hotter
    const at = apparentTemp(30, 80, 5);
    expect(at).toBeGreaterThan(30);
  });
});

describe('rollUpDaily', () => {
  it('groups hourlies into local-day buckets and computes high/low/precip', () => {
    // 48 hours starting 2026-06-15T00:00 Berlin local (= 2026-06-14T22:00Z, summer DST UTC+2)
    // Day 1: 2026-06-15, temps 10..21, precip 0.5/hour first 6 hours
    // Day 2: 2026-06-16, temps 12..23, precip 0
    const hourly: BrightSkyHourly[] = [];
    for (let i = 0; i < 24; i++) {
      hourly.push(makeHour(new Date(Date.UTC(2026, 5, 14, 22 + i)).toISOString(), {
        temperature: 10 + i * (11 / 23),
        precipitation: i < 6 ? 0.5 : 0,
        icon: i === 14 ? 'rain' : 'partly-cloudy-day', // 14 hrs after 22Z = 12:00Z = 14:00 Berlin local; we'll pick 12:00 local = 10:00Z = i=12
      }));
    }
    for (let i = 0; i < 24; i++) {
      hourly.push(makeHour(new Date(Date.UTC(2026, 5, 15, 22 + i)).toISOString(), {
        temperature: 12 + i * (11 / 23),
        precipitation: 0,
        icon: 'clear-day',
      }));
    }
    // Note: above produces day-3 hours too (after 22Z+22h crosses midnight again). We only assert the first two complete days.

    const daily = rollUpDaily(hourly, 52.52, 13.405, 'Europe/Berlin');
    expect(daily.length).toBeGreaterThanOrEqual(2);

    const day1 = daily.find((d) => d.date === '2026-06-15');
    expect(day1).toBeDefined();
    expect(day1!.high).toBeCloseTo(21, 0);
    expect(day1!.low).toBeCloseTo(10, 0);
    expect(day1!.precip).toBeCloseTo(3, 1); // 6 × 0.5

    const day2 = daily.find((d) => d.date === '2026-06-16');
    expect(day2).toBeDefined();
    expect(day2!.high).toBeCloseTo(23, 0);
    expect(day2!.precip).toBeCloseTo(0, 1);
  });

  it('picks weatherCode from the entry closest to 12:00 local time', () => {
    // Day with rain at 12:00 Berlin local (= 10:00Z in summer DST)
    const hourly: BrightSkyHourly[] = [];
    for (let i = 0; i < 24; i++) {
      const isNoon = i === 10; // 10:00Z = 12:00 Berlin in summer DST
      hourly.push(makeHour(new Date(Date.UTC(2026, 5, 15, i)).toISOString(), {
        temperature: 15,
        icon: isNoon ? 'rain' : 'clear-day',
      }));
    }
    const daily = rollUpDaily(hourly, 52.52, 13.405, 'Europe/Berlin');
    const day = daily.find((d) => d.date === '2026-06-15');
    expect(day).toBeDefined();
    // 'rain' → WMO code 63
    expect(day!.weatherCode).toBe(63);
  });

  it('emits sunrise/sunset as UTC ISO strings ending in Z', () => {
    const hourly: BrightSkyHourly[] = [
      makeHour('2026-06-15T12:00:00+00:00', { temperature: 20 }),
    ];
    const daily = rollUpDaily(hourly, 52.52, 13.405, 'Europe/Berlin');
    expect(daily.length).toBe(1);
    expect(daily[0]!.sunrise).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(daily[0]!.sunset).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('fetchBrightSkyForecast', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches current + weather and assembles WeatherData', async () => {
    const hourly: BrightSkyHourly[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        hourly.push(makeHour(new Date(Date.UTC(2026, 4, 1 + d, h)).toISOString(), {
          temperature: 15 + h * 0.1,
          precipitation_probability: h < 3 ? null : 20, // null is allowed
        }));
      }
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/current_weather')) {
        return new Response(JSON.stringify(mockCurrent), { status: 200 });
      }
      if (url.includes('/weather?')) {
        return new Response(JSON.stringify({ weather: hourly }), { status: 200 });
      }
      throw new Error(`unexpected URL: ${url}`);
    });

    const data = await fetchBrightSkyForecast(berlin);

    expect(data.current.temp).toBe(18.5);
    expect(data.current.humidity).toBe(55);
    expect(data.current.windSpeed).toBe(12.3);
    expect(typeof data.current.feelsLike).toBe('number');
    expect(typeof data.current.weatherCode).toBe('number');
    expect(data.hourly.length).toBe(168);
    // Required Zod field — null in source must become 0 in output
    expect(data.hourly[0]!.precipProb).toBe(0);
    // Frontend expects YYYY-MM-DDTHH:MM (no offset, no Z) — same shape as Open-Meteo
    expect(data.hourly[0]!.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(data.daily.length).toBeGreaterThanOrEqual(7);
    expect(data.alerts).toEqual([]);
  });

  it('throws on non-OK response with status in message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('upstream gone', { status: 503 }));
    await expect(fetchBrightSkyForecast(berlin)).rejects.toThrow(/503/);
  });
});
