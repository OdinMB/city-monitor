import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { WaterLevelData, WaterLevelStation } from '../../lib/api.js';
import { WaterLevelStrip } from './WaterLevelStrip.js';

function station(uuid: string, currentLevel: number, state: WaterLevelStation['state']): WaterLevelStation {
  return { uuid, name: `Gauge ${uuid}`, waterBody: 'Spree', lat: 52.5, lon: 13.4, currentLevel, timestamp: '2026-10-26T08:00:00Z', state, tidal: false };
}

const DATA: WaterLevelData = {
  stations: [station('a', 1234, 'high'), station('b', 87, 'normal')],
  fetchedAt: '2026-10-26T08:00:00Z',
};

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useWaterLevels.js', () => ({
  useWaterLevels: () => ({ data: DATA, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe('WaterLevelStrip levels', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  // The level is written as the number comes, with no grouping, in every language.
  it.each(['en', 'de', 'tr', 'ar'])('reads "<cm> cm" in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<WaterLevelStrip />);
    expect(screen.getByText('1234 cm')).toBeTruthy();
    expect(screen.getByText('87 cm')).toBeTruthy();
  });
});
