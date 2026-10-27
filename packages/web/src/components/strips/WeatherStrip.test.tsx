import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { DwdUvForecast, WeatherData } from '@city-monitor/shared';
import { isolate } from '../../lib/bidi.js';
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

/**
 * In Arabic the page runs right to left, and the bidi algorithm moves a sign
 * or a unit to the other end of its number ("3°-", "km/h 16"). Each value is
 * one isolated run (U+2068 … U+2069), so it reads "-3°" and "16 km/h" there.
 */
describe('WeatherStrip values and warnings in Arabic', () => {
  const FROSTY: WeatherData = {
    current: { temp: -3.4, feelsLike: -7.2, humidity: 65, precipitation: 1.2, weatherCode: 71, windSpeed: 16.4, windDirection: 90 },
    hourly: [{ time: '2026-01-10T15:00', temp: -4.6, precipProb: 20, weatherCode: 71 }],
    daily: [{ date: '2026-01-11', high: -1, low: -8, weatherCode: 71, precip: 5.7, sunrise: '08:15', sunset: '16:10' }],
    alerts: [
      { headline: '[Synthetisch] Amtliche WARNUNG vor GLÄTTE (Stufe 2).', severity: 'moderate', description: '', validUntil: '' },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  it.each(['ar', 'en'])('keeps the minus in front of a temperature below zero (%s)', async (lang) => {
    await i18n.changeLanguage(lang);
    weather = FROSTY;
    render(<WeatherStrip expanded />);
    expect(screen.getByText(isolate('-3°'))).toBeTruthy();
    expect(screen.getByText(`${i18n.t('panel.weather.feelsLike')} ${isolate('-7°')}`)).toBeTruthy();
    expect(screen.getByText(isolate('-5°'))).toBeTruthy(); // hourly
    expect(screen.getByText(isolate('-1°'))).toBeTruthy(); // daily high
    expect(screen.getByText(isolate('-8°'))).toBeTruthy(); // daily low
  });

  it('keeps each unit after its number in one run', async () => {
    await i18n.changeLanguage('ar');
    weather = FROSTY;
    render(<WeatherStrip expanded />);
    expect(screen.getByText(`${i18n.t('panel.weather.humidity')} ${isolate('65%')}`)).toBeTruthy();
    expect(screen.getByText(`${i18n.t('panel.weather.wind')} ${isolate('16 km/h')}`)).toBeTruthy();
    expect(screen.getByText(isolate('1.2 mm'))).toBeTruthy();
    expect(screen.getByText(isolate('5.7mm'))).toBeTruthy(); // daily, unit attached as before
  });

  it('runs a German warning headline in its own direction, brackets and full stop in place', async () => {
    await i18n.changeLanguage('ar');
    weather = FROSTY;
    render(<WeatherStrip expanded />);
    const headline = screen.getByText('[Synthetisch] Amtliche WARNUNG vor GLÄTTE (Stufe 2).');
    expect(headline.tagName).toBe('BDI');
    expect(headline.getAttribute('dir')).toBe('auto');
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
