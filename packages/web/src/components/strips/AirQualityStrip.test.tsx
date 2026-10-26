import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { AirQualityStrip } from './AirQualityStrip.js';

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useAirQuality.js', () => ({
  useAirQuality: () => ({ data: undefined, fetchedAt: null, isLoading: false, isError: true, refetch: vi.fn() }),
}));

vi.mock('../../hooks/useAirQualityGrid.js', () => ({
  useAirQualityGrid: () => ({ data: [] }),
}));

describe('AirQualityStrip error state', () => {
  afterEach(async () => {
    cleanup(); // unmount first, so switching back to English re-renders nothing
    await i18n.changeLanguage('en');
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
