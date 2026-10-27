import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { DwdUvForecast, WeatherData } from '@city-monitor/shared';
import { WeatherStrip } from './WeatherStrip.js';

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
