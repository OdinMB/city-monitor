import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { WeatherData } from '@city-monitor/shared';
import { WeatherPopover } from './WeatherPopover.js';

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin', timezone: 'Europe/Berlin' }),
}));

let weather: WeatherData | undefined;

vi.mock('../../hooks/useWeather.js', () => ({
  useWeather: () => ({ data: weather, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

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
