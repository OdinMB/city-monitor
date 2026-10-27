import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { WeatherData } from '@city-monitor/shared';
import { isolate } from '../../lib/bidi.js';
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
    ['en', 'Heavy rain', `Precip ${isolate('1.2 mm')}`],
    ['de', 'Starker Regen', `Niederschlag ${isolate('1.2 mm')}`],
    ['tr', 'Kuvvetli yağmur', `Yağış ${isolate('1.2 mm')}`],
    ['ar', 'مطر غزير', `الهطول ${isolate('1.2 mm')}`],
  ])('names the condition and the precipitation in %s', async (lang, condition, precip) => {
    await i18n.changeLanguage(lang);
    weather = RAINY;
    render(<WeatherPopover />);
    expect(screen.getByText(condition)).toBeTruthy();
    expect(screen.getByText(precip)).toBeTruthy();
  });

  it('keeps signs and units with their numbers and German warnings in order in Arabic', async () => {
    await i18n.changeLanguage('ar');
    weather = {
      current: { temp: -2.74, feelsLike: -6.6, humidity: 81, precipitation: 0.4, weatherCode: 71, windSpeed: 9.6, windDirection: 90 },
      hourly: [{ time: '2999-01-10T15:00', temp: -4.4, precipProb: 20, weatherCode: 71 }],
      daily: [{ date: '2999-01-11', high: -1.2, low: -8.4, weatherCode: 71, precip: 3.1, sunrise: '08:15', sunset: '16:10' }],
      alerts: [{ headline: '[Synthetisch] Amtliche WARNUNG vor FROST (Stufe 1).', severity: 'moderate', description: '', validUntil: '' }],
    };
    render(<WeatherPopover />);
    expect(screen.getByText(isolate('-2.7°'))).toBeTruthy();
    expect(screen.getByText(`${i18n.t('panel.weather.feelsLike')} ${isolate('-7°')}`)).toBeTruthy();
    expect(screen.getByText(`${i18n.t('panel.weather.humidity')} ${isolate('81%')}`)).toBeTruthy();
    expect(screen.getByText(`${i18n.t('panel.weather.wind')} ${isolate('10 km/h')}`)).toBeTruthy();
    expect(screen.getByText(isolate('-4°'))).toBeTruthy(); // hourly
    // Daily high and low, in the desktop columns and the phone list.
    expect(screen.getAllByText(isolate('-1°'))).toHaveLength(2);
    expect(screen.getAllByText(isolate('-8°'))).toHaveLength(2);
    expect(screen.getByText(isolate('3.1mm'))).toBeTruthy();
    expect(screen.getByText(isolate('3.1 mm'))).toBeTruthy();
    const headline = screen.getByText('[Synthetisch] Amtliche WARNUNG vor FROST (Stufe 1).');
    expect(headline.tagName).toBe('BDI');
    expect(headline.getAttribute('dir')).toBe('auto');
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
