import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import i18n from 'i18next';
import { CityProvider } from '../../hooks/CityProvider.js';
import { TopBar } from './TopBar.js';
import type { WeatherAlert, WeatherData } from '@city-monitor/shared';

const mockWeather: WeatherData = {
  current: { temp: 12.5, feelsLike: 10.2, humidity: 65, precipitation: 0, weatherCode: 3, windSpeed: 15.3, windDirection: 240 },
  hourly: [
    { time: '2026-03-02T14:00', temp: 13, precipProb: 10, weatherCode: 2 },
  ],
  daily: [
    { date: '2026-03-02', high: 15, low: 5, weatherCode: 3, precip: 0, sunrise: '06:30', sunset: '18:15' },
  ],
  alerts: [],
};

const mockAirQuality = {
  current: { europeanAqi: 18, pm25: 5.2, pm10: 12.1, no2: 22.3, o3: 45.6, updatedAt: '2026-03-02T12:00:00Z' },
  hourly: [],
};

function createWrapper(options?: { weather?: WeatherData; airQuality?: typeof mockAirQuality }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (options?.weather) {
    queryClient.setQueryData(['weather', 'berlin'], { data: options.weather, fetchedAt: new Date().toISOString() });
  }
  if (options?.airQuality) {
    queryClient.setQueryData(['air-quality', 'berlin'], { data: options.airQuality, fetchedAt: new Date().toISOString() });
  }

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(null), { status: 200 }),
    );
  });

  it('renders city name in uppercase', () => {
    render(<TopBar />, { wrapper: createWrapper() });
    expect(screen.getAllByText('BERLIN').length).toBeGreaterThanOrEqual(1);
  });

  it('renders AQI stat with level label when air quality data is available', () => {
    render(<TopBar />, { wrapper: createWrapper({ airQuality: mockAirQuality }) });
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText(/AQI · Good/)).toBeTruthy();
  });

  it('does not render AQI stat when no air quality data', () => {
    render(<TopBar />, { wrapper: createWrapper() });
    expect(screen.queryByText(/AQI/)).toBeNull();
  });

  it('renders weather next to city name when weather data is available', () => {
    render(<TopBar />, { wrapper: createWrapper({ weather: mockWeather }) });
    expect(screen.getByText(/13°/)).toBeTruthy();
  });

  it('gives the weather and AQI buttons accessible names that include their values', () => {
    render(<TopBar />, { wrapper: createWrapper({ weather: mockWeather, airQuality: mockAirQuality }) });
    expect(screen.getByRole('button', { name: 'Weather: 13°' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Air Quality: 18 AQI, Good' })).toBeTruthy();
  });
});

describe('TopBar weather warning hint', () => {
  const warning = (severity: string): WeatherAlert => ({
    headline: 'Amtliche WARNUNG vor STURMBÖEN',
    severity,
    description: '',
    validUntil: '',
  });
  const withWarnings = (...severities: string[]): WeatherData => ({ ...mockWeather, alerts: severities.map(warning) });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(null), { status: 200 }));
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  it('shows no hint while no warning is in force', () => {
    render(<TopBar />, { wrapper: createWrapper({ weather: mockWeather }) });
    const chip = screen.getByRole('button', { name: 'Weather: 13°' });
    expect(chip.textContent).not.toMatch(/Warning|Severe|Extreme/);
  });

  describe('when a warning has run out', () => {
    const MIN = 60_000;
    const NOW = Date.parse('2026-07-15T18:00:00Z');
    const endingAt = (severity: string, ms: number): WeatherAlert => ({ ...warning(severity), validUntil: new Date(ms).toISOString() });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      vi.setSystemTime(new Date(NOW));
    });

    it('shows no hint once the warning is more than five minutes past its end', () => {
      render(<TopBar />, { wrapper: createWrapper({ weather: { ...mockWeather, alerts: [endingAt('severe', NOW - 6 * MIN)] } }) });
      const chip = screen.getByRole('button', { name: 'Weather: 13°' });
      expect(chip.textContent).not.toMatch(/Warning|Severe|Extreme/);
    });

    it('still shows it within five minutes of its end, for a device clock that runs a little fast', () => {
      render(<TopBar />, { wrapper: createWrapper({ weather: { ...mockWeather, alerts: [endingAt('severe', NOW - 4 * MIN)] } }) });
      expect(screen.getByRole('button', { name: 'Weather: 13°, Severe weather warning' })).toBeTruthy();
    });

    it('names the most serious level among the warnings still in force', () => {
      const alerts = [endingAt('extreme', NOW - 30 * MIN), endingAt('moderate', NOW + 60 * MIN)];
      render(<TopBar />, { wrapper: createWrapper({ weather: { ...mockWeather, alerts } }) });
      expect(screen.getByRole('button', { name: 'Weather: 13°, Significant weather warning' })).toBeTruthy();
    });

    it('drops the hint five minutes after the end while the page stays open', () => {
      render(<TopBar />, { wrapper: createWrapper({ weather: { ...mockWeather, alerts: [endingAt('severe', NOW + 2 * MIN)] } }) });
      expect(screen.getByRole('button', { name: 'Weather: 13°, Severe weather warning' })).toBeTruthy();

      act(() => vi.advanceTimersByTime(6 * MIN));
      expect(screen.getByRole('button', { name: 'Weather: 13°, Severe weather warning' })).toBeTruthy();

      act(() => vi.advanceTimersByTime(MIN));
      const chip = screen.getByRole('button', { name: 'Weather: 13°' });
      expect(chip.textContent).not.toMatch(/Severe/);
    });
  });

  it.each([
    ['moderate', 'Warning', 'Significant weather warning'],
    ['severe', 'Severe', 'Severe weather warning'],
    ['extreme', 'Extreme', 'Extreme weather warning'],
  ])('shows the %s level on the weather chip, by word and in its accessible name', (severity, word, level) => {
    render(<TopBar />, { wrapper: createWrapper({ weather: withWarnings(severity) }) });
    const chip = screen.getByRole('button', { name: `Weather: 13°, ${level}` });
    expect(within(chip).getByText(word)).toBeTruthy();
  });

  it('names the most serious level when several warnings are in force', () => {
    render(<TopBar />, { wrapper: createWrapper({ weather: withWarnings('moderate', 'extreme', 'severe') }) });
    const chip = screen.getByRole('button', { name: 'Weather: 13°, Extreme weather warning' });
    expect(within(chip).getByText('Extreme')).toBeTruthy();
  });

  it('lets the AQI chip\'s words give way on a narrow phone, keeping its number and the weather chip whole', () => {
    // jsdom does no layout: check the classes the header row relies on.
    render(<TopBar />, { wrapper: createWrapper({ weather: withWarnings('severe'), airQuality: mockAirQuality }) });
    const has = (el: Element, cls: string) => el.classList.contains(cls);
    const weather = screen.getByRole('button', { name: 'Weather: 13°, Severe weather warning' });
    expect(has(weather, 'shrink-0')).toBe(true);

    const aqi = screen.getByRole('button', { name: 'Air Quality: 18 AQI, Good' });
    expect(has(aqi, 'inline-flex') && has(aqi, 'min-w-0')).toBe(true);
    expect(has(aqi, 'shrink-0') || has(aqi, 'truncate')).toBe(false);
    const number = within(aqi).getByText('18');
    expect(has(number, 'shrink-0')).toBe(true);
    const words = within(aqi).getByText('AQI · Good');
    expect(has(words, 'truncate') && has(words, 'min-w-0')).toBe(true);
  });

  it.each([
    ['de', 'Wetter: 13°, Unwetterwarnung', 'Unwetter'],
    ['tr', 'Hava Durumu: 13°, Şiddetli hava uyarısı', 'Şiddetli'],
    ['ar', 'الطقس: 13°, تحذير من طقس شديد', 'شديد'],
  ])('says it in the reader\'s language (%s)', async (lang, name, word) => {
    await i18n.changeLanguage(lang);
    render(<TopBar />, { wrapper: createWrapper({ weather: withWarnings('severe') }) });
    const chip = screen.getByRole('button', { name });
    expect(within(chip).getByText(word)).toBeTruthy();
  });
});
