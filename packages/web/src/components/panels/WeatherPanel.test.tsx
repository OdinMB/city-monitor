/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/useCityConfig.js';
import { WeatherPanel } from './WeatherPanel.js';
import type { WeatherData } from '@city-monitor/shared';

const mockWeather: WeatherData = {
  current: { temp: 12.5, feelsLike: 10.2, humidity: 65, precipitation: 0, weatherCode: 3, windSpeed: 15.3, windDirection: 240 },
  hourly: [
    { time: '2026-03-02T14:00', temp: 13, precipProb: 10, weatherCode: 2 },
    { time: '2026-03-02T15:00', temp: 12, precipProb: 20, weatherCode: 3 },
  ],
  daily: [
    { date: '2026-03-02', high: 15, low: 5, weatherCode: 3, precip: 0, sunrise: '06:30', sunset: '18:15' },
    { date: '2026-03-03', high: 12, low: 4, weatherCode: 61, precip: 5.2, sunrise: '06:28', sunset: '18:17' },
  ],
  alerts: [],
};

function createWrapper(weather?: WeatherData) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (weather) {
    queryClient.setQueryData(['weather', 'berlin'], weather);
  }

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CityProvider cityId="berlin">{children}</CityProvider>
    </QueryClientProvider>
  );
}

describe('WeatherPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ current: null, hourly: [], daily: [], alerts: [] }), { status: 200 }),
    );
  });

  it('renders current temperature when data is available', () => {
    render(<WeatherPanel />, { wrapper: createWrapper(mockWeather) });
    // Temperature should be visible as text
    expect(screen.getByText(/12\.5/)).toBeTruthy();
  });

  it('renders daily forecast section', () => {
    render(<WeatherPanel />, { wrapper: createWrapper(mockWeather) });
    expect(screen.getByText('Forecast')).toBeTruthy();
    // Should render daily entries (weather icons appear for each day)
    expect(screen.getByText('Hourly')).toBeTruthy();
  });

  it('shows skeleton when loading', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </QueryClientProvider>
    );

    render(<WeatherPanel />, { wrapper });
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });

  it('renders weather alerts when present', () => {
    const weatherWithAlerts: WeatherData = {
      ...mockWeather,
      alerts: [{ headline: 'Sturm-Warnung', severity: 'severe', description: 'Schwere Sturmböen', validUntil: '2026-03-03T00:00:00Z' }],
    };
    render(<WeatherPanel />, { wrapper: createWrapper(weatherWithAlerts) });
    expect(screen.getByText('Sturm-Warnung')).toBeTruthy();
  });
});
