import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { DailyForecast, HourlyForecast, WeatherData } from '@city-monitor/shared';
import { WeatherPopover } from './WeatherPopover.js';

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin', timezone: 'Europe/Berlin' }),
}));

let weather: WeatherData | undefined;

vi.mock('../../hooks/useWeather.js', () => ({
  useWeather: () => ({ data: weather, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

// The browser's own zone must not matter: run in one that is neither UTC nor Berlin.
let savedTz: string | undefined;
beforeAll(() => {
  savedTz = process.env.TZ;
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

const RAINY: WeatherData = {
  current: { temp: 9, feelsLike: 7, humidity: 90, precipitation: 1.2, weatherCode: 65, windSpeed: 20, windDirection: 240 },
  hourly: [],
  daily: [],
  alerts: [],
};

describe('WeatherPopover follows the UI language', () => {
  afterEach(async () => {
    cleanup();
    weather = undefined;
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', 'Heavy rain', 'Precip 1.2 mm'],
    ['de', 'Starker Regen', 'Niederschlag 1.2 mm'],
    ['tr', 'Kuvvetli yağmur', 'Yağış 1.2 mm'],
    ['ar', 'مطر غزير', 'الهطول 1.2 mm'],
  ])('names the condition and the precipitation in %s', async (lang, condition, precip) => {
    await i18n.changeLanguage(lang);
    weather = RAINY;
    render(<WeatherPopover />);
    expect(screen.getByText(condition)).toBeTruthy();
    expect(screen.getByText(precip)).toBeTruthy();
  });

  it.each([
    ['en', 'No weather data'],
    ['de', 'Keine Wetterdaten'],
    ['tr', 'Hava durumu verisi yok'],
    ['ar', 'لا تتوفر بيانات الطقس'],
  ])('says so when there is no weather data (%s)', async (lang, text) => {
    await i18n.changeLanguage(lang);
    render(<WeatherPopover />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});

describe('WeatherPopover warnings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 21:30 UTC is 23:30 in Berlin (CEST)
    vi.setSystemTime(new Date('2026-07-15T21:30:00Z'));
  });

  afterEach(() => {
    cleanup();
    weather = undefined;
    vi.useRealTimers();
  });

  it("shows each warning with its level, its end on Berlin's clock and its source", () => {
    weather = {
      ...RAINY,
      // 04:00 UTC on the 16th is 06:00 the next morning in Berlin
      alerts: [{ headline: 'Amtliche WARNUNG vor STURMBÖEN', severity: 'extreme', description: '', validUntil: '2026-07-16T04:00:00.000Z' }],
    };
    render(<WeatherPopover />);
    const row = screen.getByRole('listitem');
    expect(row.textContent).toBe(
      'Extreme weather warningUntil tomorrow, 06:00Amtliche WARNUNG vor STURMBÖENSource: Deutscher Wetterdienst (DWD)',
    );
  });
});

/** Hourly entries as the server sends them: UTC "YYYY-MM-DDTHH:MM", no offset. */
function hourlyFrom(startUtc: string, hours: number): HourlyForecast[] {
  const start = Date.parse(`${startUtc}Z`);
  return Array.from({ length: hours }, (_, i) => ({
    time: new Date(start + i * 3_600_000).toISOString().slice(0, 16),
    temp: 20,
    precipProb: 0,
    weatherCode: 1,
  }));
}

function dailyFrom(firstDate: string, days: number): DailyForecast[] {
  const first = Date.parse(`${firstDate}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(first + i * 86_400_000).toISOString().slice(0, 10),
    high: 25,
    low: 15,
    weatherCode: 1,
    precip: 0,
    sunrise: '',
    sunset: '',
  }));
}

function weatherWith(forecast: Partial<Pick<WeatherData, 'hourly' | 'daily'>>): WeatherData {
  return {
    current: { temp: 21, feelsLike: 20, humidity: 50, precipitation: 0, weatherCode: 1, windSpeed: 10, windDirection: 200 },
    hourly: [],
    daily: [],
    alerts: [],
    ...forecast,
  };
}

function hourLabels(): string[] {
  return screen.queryAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent ?? '');
}

/** Day labels of the desktop row; the mobile list repeats them. */
function dayLabels(days: number): string[] {
  return screen
    .queryAllByText(/^(Today|Tmrw|Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)
    .slice(0, days)
    .map((el) => el.textContent ?? '');
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${String(from + i).padStart(2, '0')}:00`);

describe("WeatherPopover forecast in the city's time", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    cleanup();
    weather = undefined;
    vi.useRealTimers();
  });

  it.each([
    // 09:30 UTC is 11:30 in Berlin (CEST)
    ['summer (CEST)', '2026-07-15', range(12, 23)],
    // 09:30 UTC is 10:30 in Berlin (CET)
    ['winter (CET)', '2026-01-15', range(11, 22)],
  ])('labels the next 12 hours on Berlin clocks in %s', (_season, day, labels) => {
    vi.setSystemTime(new Date(`${day}T09:30:00Z`));
    weather = weatherWith({ hourly: hourlyFrom(`${day}T08:00`, 30) });
    render(<WeatherPopover />);
    expect(hourLabels()).toEqual(labels);
  });

  it("starts the hours after Berlin's midnight while UTC is still on the day before", () => {
    // 22:30 UTC on 15 July is 00:30 on 16 July in Berlin
    vi.setSystemTime(new Date('2026-07-15T22:30:00Z'));
    weather = weatherWith({ hourly: hourlyFrom('2026-07-15T20:00', 30) });
    render(<WeatherPopover />);
    expect(hourLabels()).toEqual(range(1, 12));
  });

  it.each([
    // 00:30 on Thursday 16 July in Berlin (CEST)
    ['summer (CEST)', '2026-07-15T22:30:00Z', '2026-07-16', ['Today', 'Tmrw', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']],
    // 00:30 on Friday 16 January in Berlin (CET)
    ['winter (CET)', '2026-01-15T23:30:00Z', '2026-01-16', ['Today', 'Tmrw', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']],
  ])("names Berlin's today and tomorrow just after its midnight in %s", (_season, now, today, days) => {
    vi.setSystemTime(new Date(now));
    weather = weatherWith({ daily: dailyFrom(today, 7) });
    render(<WeatherPopover />);
    expect(dayLabels(7)).toEqual(days);
  });
});
