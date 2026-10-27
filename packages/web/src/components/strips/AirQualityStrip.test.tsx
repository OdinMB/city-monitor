import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { AirQuality, AirQualityGridPoint } from '../../lib/api.js';
import { AirQualityStrip } from './AirQualityStrip.js';

const hooks = vi.hoisted(() => ({
  airQuality: {} as { data: unknown; fetchedAt: string | null; isLoading: boolean; isError: boolean; refetch: () => void },
  grid: [] as unknown[],
}));

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useAirQuality.js', () => ({
  useAirQuality: () => hooks.airQuality,
}));

vi.mock('../../hooks/useAirQualityGrid.js', () => ({
  useAirQualityGrid: () => ({ data: hooks.grid }),
}));

afterEach(async () => {
  cleanup(); // unmount first, so switching back to English re-renders nothing
  await i18n.changeLanguage('en');
});

describe('AirQualityStrip error state', () => {
  beforeEach(() => {
    hooks.airQuality = { data: undefined, fetchedAt: null, isLoading: false, isError: true, refetch: vi.fn() };
    hooks.grid = [];
  });

  it.each([
    ['en', 'Failed to load Air Quality'],
    ['de', 'Luftqualität: Laden fehlgeschlagen'],
    ['tr', 'Hava Kalitesi yüklenemedi'],
    ['ar', 'جودة الهواء: فشل التحميل'],
  ])('names the tile in the reader\'s language (%s)', async (lang, message) => {
    await i18n.changeLanguage(lang);
    render(<AirQualityStrip expanded={false} />);
    expect(screen.getByText(message)).toBeTruthy();
  });
});

describe('AirQualityStrip station list', () => {
  const AIR_QUALITY: AirQuality = {
    current: { europeanAqi: 32, pm25: 8.1, pm10: 15.2, no2: 18.5, o3: 55.2, updatedAt: '2026-10-26T12:00:00Z' },
    hourly: [],
  };
  const WAQI: AirQualityGridPoint = { lat: 52.52, lon: 13.4, europeanAqi: 85, station: 'Berlin Mitte, Germany', url: 'https://aqicn.org/station/@6132/' };
  const SENSOR: AirQualityGridPoint = { lat: 52.5, lon: 13.42, europeanAqi: 85, station: 'Kreuzberg Sensor', url: 'https://maps.sensor.community/#17/52.5/13.42' };

  beforeEach(() => {
    hooks.airQuality = { data: AIR_QUALITY, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() };
    hooks.grid = [WAQI, SENSOR];
  });

  it('lists WAQI stations under a US AQI heading, coloured on the US scale', () => {
    render(<AirQualityStrip expanded />);
    expect(screen.getByText('US AQI')).toBeTruthy();
    const name = screen.getByText('Berlin Mitte');
    expect(name.nextElementSibling!.textContent).toBe('85');
    // US "Moderate" yellow, not the European "Very Poor" purple, ringed so it shows on white
    const dot = name.previousElementSibling as HTMLElement;
    expect(dot.style.backgroundColor).toBe('rgb(255, 255, 0)');
    expect(dot.classList.contains('ring-1')).toBe(true);
    expect(screen.queryByText('Kreuzberg Sensor')).toBeNull();
  });

  it('keeps the headline on the European scale', () => {
    render(<AirQualityStrip expanded />);
    expect(screen.getByText('Fair (AQI)')).toBeTruthy();
  });

  it.each([
    ['en', 'Stations: World Air Quality Index Project and originating agencies'],
    ['de', 'Messstationen: World Air Quality Index Project und die Messnetzbetreiber'],
    ['tr', 'İstasyonlar: World Air Quality Index Project ve kaynak kurumlar'],
    ['ar', 'المحطات: World Air Quality Index Project والجهات المصدرة للبيانات'],
  ])('credits WAQI and the originating agencies under the list (%s)', async (lang, credit) => {
    await i18n.changeLanguage(lang);
    render(<AirQualityStrip expanded />);
    expect(screen.getByText(credit)).toBeTruthy();
  });

  it('centres the scale marker on the value from the scale\'s start, which is the right edge in Arabic', () => {
    // The scale's segments are a flex row, so they mirror in Arabic; a marker
    // placed with `left` did not, and pointed at the wrong end of the scale.
    render(<AirQualityStrip expanded />);
    const scale = screen.getByRole('img', { name: /^AQI 32/ });
    const marker = scale.querySelector<HTMLElement>('.absolute')!;
    expect(marker.style.insetInlineStart).toBe('32%');
    expect(marker.style.left).toBe('');
    // The marker box has no width, so a percentage translate moved nothing:
    // the dot started at the value instead of sitting on it.
    expect(marker.style.transform).toBe('');
    expect(marker.firstElementChild!.classList.contains('-ms-1.5')).toBe(true);
    expect(marker.firstElementChild!.classList.contains('w-3')).toBe(true);
  });

  it('keeps each pollutant reading and its unit in one left-to-right run, so the unit\'s margin falls between them', async () => {
    // Without the isolate the unit's ms-0.5 followed the Arabic page and
    // landed on its outer side: "8.1µg/m³".
    await i18n.changeLanguage('ar');
    render(<AirQualityStrip expanded />);
    const units = screen.getAllByText('µg/m³');
    expect(units).toHaveLength(4);
    for (const unit of units) {
      expect(unit.classList.contains('ms-0.5')).toBe(true);
      const run = unit.parentElement!;
      expect(run.tagName).toBe('BDI');
      expect(run.getAttribute('dir')).toBe('ltr');
    }
    expect(units[0].parentElement!.textContent).toBe('8.1µg/m³');
  });

  it('shows no heading or credit when there are no WAQI stations', () => {
    hooks.grid = [SENSOR];
    render(<AirQualityStrip expanded />);
    expect(screen.queryByText('US AQI')).toBeNull();
    expect(screen.queryByText(/World Air Quality Index Project/)).toBeNull();
  });
});
