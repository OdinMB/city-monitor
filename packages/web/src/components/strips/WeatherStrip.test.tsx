import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { DailyForecast, DwdUvForecast, HourlyForecast, WeatherData } from '@city-monitor/shared';
import { WeatherStrip } from './WeatherStrip.js';

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

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin', timezone: 'Europe/Berlin' }),
}));

let weather: WeatherData;

vi.mock('../../hooks/useWeather.js', () => ({
  useWeather: () => ({ data: weather, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

function weatherWith(dwdUv?: DwdUvForecast): WeatherData {
  return {
    current: { temp: 21, feelsLike: 20, humidity: 50, precipitation: 0, weatherCode: 1, windSpeed: 10, windDirection: 200 },
    hourly: [],
    daily: [],
    alerts: [],
    ...(dwdUv ? { dwdUv } : {}),
  };
}

const forecast: DwdUvForecast = { today: 4, tomorrow: 7, dayAfter: 2, forecastDay: '2026-06-10' };

function uvText(): string | null {
  return screen.queryByTitle("Today's highest UV index (DWD forecast)")?.textContent ?? null;
}

describe('WeatherStrip UV index', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-10T10:00:00Z'));
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  it("shows today's DWD UV value with its risk level", () => {
    weather = weatherWith(forecast);
    render(<WeatherStrip expanded={false} />);
    expect(uvText()).toBe('UV max 4 Moderate');
  });

  it("shows the next day's value before DWD publishes a new forecast", () => {
    vi.setSystemTime(new Date('2026-06-11T04:00:00Z'));
    weather = weatherWith(forecast);
    render(<WeatherStrip expanded={false} />);
    expect(uvText()).toBe('UV max 7 High');
  });

  it.each([
    ['de', 'UV max. 4 Mäßig'],
    ['tr', 'Maks. UV 4 Orta'],
    ['ar', 'أقصى UV 4 معتدل'],
  ])('labels the daily maximum and names the risk level in the reader\'s language (%s)', async (lang, text) => {
    await i18n.changeLanguage(lang);
    weather = weatherWith(forecast);
    render(<WeatherStrip expanded={false} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('shows no UV index without a DWD forecast', () => {
    weather = weatherWith();
    render(<WeatherStrip expanded={false} />);
    expect(uvText()).toBeNull();
    expect(screen.queryByText(/UV/)).toBeNull();
  });

  it('shows no UV index once the forecast no longer covers today', () => {
    vi.setSystemTime(new Date('2026-06-14T10:00:00Z'));
    weather = weatherWith(forecast);
    render(<WeatherStrip expanded={false} />);
    expect(screen.queryByText(/UV/)).toBeNull();
  });
});

describe('WeatherStrip warnings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T09:30:00Z'));
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  it("shows each warning with its level, its end on Berlin's clock and its source, collapsed or not", async () => {
    await i18n.changeLanguage('de');
    weather = {
      ...weatherWith(),
      alerts: [
        // 16:00 UTC is 18:00 in Berlin (CEST)
        { headline: 'Amtliche UNWETTERWARNUNG vor ORKANBÖEN', severity: 'severe', description: '', validUntil: '2026-07-15T16:00:00.000Z' },
        { headline: 'Amtliche WARNUNG vor HITZE', severity: 'moderate', description: '', validUntil: '' },
      ],
    };
    for (const expanded of [false, true]) {
      render(<WeatherStrip expanded={expanded} />);
      const rows = screen.getAllByRole('listitem');
      expect(rows.map((row) => row.textContent)).toEqual([
        'UnwetterwarnungBis 18:00 UhrAmtliche UNWETTERWARNUNG vor ORKANBÖENQuelle: Deutscher Wetterdienst (DWD)',
        'Markante WetterwarnungBis auf WeiteresAmtliche WARNUNG vor HITZEQuelle: Deutscher Wetterdienst (DWD)',
      ]);
      cleanup();
    }
  });
});

describe('WeatherStrip condition', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', 'Mainly clear'],
    ['de', 'Überwiegend klar'],
    ['tr', 'Az bulutlu'],
    ['ar', 'صحو غالباً'],
  ])('names the current condition in the reader\'s language (%s)', async (lang, name) => {
    await i18n.changeLanguage(lang);
    weather = weatherWith();
    render(<WeatherStrip expanded={false} />);
    expect(screen.getByText(name)).toBeTruthy();
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

function hourLabels(): string[] {
  return screen.queryAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent ?? '');
}

function dayLabels(): string[] {
  return screen.queryAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/).map((el) => el.textContent ?? '');
}

describe("WeatherStrip forecast in the city's time", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each([
    // 09:30 UTC is 11:30 in Berlin (CEST); the hours step by Berlin's time of day
    ['summer (CEST)', '2026-07-15', ['12:00', '14:00', '16:00', '18:00', '19:00', '20:00', '21:00']],
    // 09:30 UTC is 10:30 in Berlin (CET)
    ['winter (CET)', '2026-01-15', ['11:00', '14:00', '16:00', '18:00', '19:00', '20:00', '21:00']],
  ])('labels and samples the hours on Berlin clocks in %s', (_season, day, labels) => {
    vi.setSystemTime(new Date(`${day}T09:30:00Z`));
    weather = { ...weatherWith(), hourly: hourlyFrom(`${day}T08:00`, 30) };
    render(<WeatherStrip expanded />);
    expect(hourLabels()).toEqual(labels);
  });

  it("starts the hours after Berlin's midnight while UTC is still on the day before", () => {
    // 22:30 UTC on 15 July is 00:30 on 16 July in Berlin; night hours step by 4
    vi.setSystemTime(new Date('2026-07-15T22:30:00Z'));
    weather = { ...weatherWith(), hourly: hourlyFrom('2026-07-15T20:00', 30) };
    render(<WeatherStrip expanded />);
    expect(hourLabels()).toEqual(['01:00', '05:00', '09:00', '12:00', '14:00', '16:00', '18:00']);
  });

  it.each([
    // 00:30 on Thursday 16 July in Berlin (CEST)
    ['summer (CEST)', '2026-07-15T22:30:00Z', '2026-07-16', ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']],
    // 00:30 on Friday 16 January in Berlin (CET)
    ['winter (CET)', '2026-01-15T23:30:00Z', '2026-01-16', ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']],
  ])("leaves Berlin's today out of the daily list just after its midnight in %s", (_season, now, today, days) => {
    vi.setSystemTime(new Date(now));
    weather = { ...weatherWith(), daily: dailyFrom(today, 7) };
    render(<WeatherStrip expanded />);
    expect(dayLabels()).toEqual(days);
  });
});
