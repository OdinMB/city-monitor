import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import i18n from 'i18next';
import type { WeatherData } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
import { isolate } from '../../lib/bidi.js';
import { TopBar } from './TopBar.js';

/** The header's weather and air-quality chips open their popovers by click, tap and keyboard. */

const weather: WeatherData = {
  current: { temp: 12.5, feelsLike: 10.2, humidity: 65, precipitation: 0, weatherCode: 3, windSpeed: 15.3, windDirection: 240 },
  hourly: [],
  daily: [],
  alerts: [],
};

const airQuality = {
  current: { europeanAqi: 18, pm25: 5.2, pm10: 12.1, no2: 22.3, o3: 45.6, updatedAt: '2026-03-02T12:00:00Z' },
  hourly: [],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['weather', 'berlin'], { data: weather, fetchedAt: new Date().toISOString() });
  queryClient.setQueryData(['air-quality', 'berlin'], { data: airQuality, fetchedAt: new Date().toISOString() });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TopBar chip popovers', () => {
  // Restore only this spy: restoreAllMocks would also strip the ResizeObserver
  // mock from test-setup.ts, which the popover's positioning needs.
  let fetchSpy: { mockRestore: () => void };

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(null), { status: 200 }));
  });

  afterEach(async () => {
    cleanup();
    fetchSpy.mockRestore();
    await i18n.changeLanguage('en');
  });

  it('marks both chips as opening a dialog, closed to start with', () => {
    render(<TopBar />, { wrapper });
    for (const name of ['Weather: 13°', 'Air Quality: 18 AQI, Good']) {
      const chip = screen.getByRole('button', { name });
      expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
      expect(chip.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('opens the weather popover on a click, named and controlled by its chip, and Escape returns focus', async () => {
    render(<TopBar />, { wrapper });
    const chip = screen.getByRole('button', { name: 'Weather: 13°' });
    chip.focus();
    fireEvent.click(chip, { detail: 0 });

    const popover = await screen.findByRole('dialog', { name: 'Weather' });
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(chip.getAttribute('aria-controls')).toBe(popover.id);
    await waitFor(() => expect(document.activeElement).toBe(popover));

    fireEvent.keyDown(popover, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it('closes one chip\'s popover when the other chip is pressed, and opens that one', async () => {
    render(<TopBar />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Weather: 13°' }));
    await screen.findByRole('dialog', { name: 'Weather' });

    const aqiChip = screen.getByRole('button', { name: 'Air Quality: 18 AQI, Good' });
    fireEvent.pointerDown(aqiChip);
    fireEvent.mouseDown(aqiChip);
    fireEvent.click(aqiChip);

    const aqiPopover = await screen.findByRole('dialog', { name: 'Air Quality' });
    expect(aqiPopover.textContent).toContain('PM2.5');
    // Number and unit in one run, so the unit stays after the number in Arabic.
    expect(aqiPopover.textContent).toContain(isolate('5.2 µg/m³'));
    expect(screen.queryByRole('dialog', { name: 'Weather' })).toBeNull();
    expect(aqiChip.getAttribute('aria-expanded')).toBe('true');
  });

  it('names the popover in the reader\'s language (ar)', async () => {
    await i18n.changeLanguage('ar');
    render(<TopBar />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'الطقس: 13°' }));
    expect(await screen.findByRole('dialog', { name: 'الطقس' })).toBeTruthy();
  });
});
