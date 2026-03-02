/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/useCityConfig.js';
import { TopBar } from './TopBar.js';
import type { WeatherData } from '@city-monitor/shared';

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
    queryClient.setQueryData(['weather', 'berlin'], options.weather);
  }
  if (options?.airQuality) {
    queryClient.setQueryData(['air-quality', 'berlin'], options.airQuality);
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
    expect(screen.getByText('BERLIN')).toBeTruthy();
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
});
