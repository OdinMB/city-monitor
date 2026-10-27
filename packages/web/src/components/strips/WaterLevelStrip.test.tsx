import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { WaterLevelData, WaterLevelStation } from '../../lib/api.js';
import { isolate } from '../../lib/bidi.js';
import { WaterLevelStrip } from './WaterLevelStrip.js';

function station(uuid: string, currentLevel: number, state: WaterLevelStation['state']): WaterLevelStation {
  return { uuid, name: `Gauge ${uuid}`, waterBody: 'Spree', lat: 52.5, lon: 13.4, currentLevel, timestamp: '2026-10-26T08:00:00Z', state, tidal: false };
}

const DATA: WaterLevelData = {
  stations: [station('a', 1234, 'high'), station('b', 87, 'normal')],
  fetchedAt: '2026-10-26T08:00:00Z',
};

let data = DATA;

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useWaterLevels.js', () => ({
  useWaterLevels: () => ({ data, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe('WaterLevelStrip levels', () => {
  afterEach(async () => {
    cleanup();
    data = DATA;
    await i18n.changeLanguage('en');
  });

  // The level is written as the number comes, with no grouping, in every
  // language, and with its unit in one isolated run, so in Arabic "cm" stays
  // after the number.
  it.each(['en', 'de', 'tr', 'ar'])('reads "<cm> cm" in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<WaterLevelStrip />);
    expect(screen.getByText(isolate('1234 cm'))).toBeTruthy();
    expect(screen.getByText(isolate('87 cm'))).toBeTruthy();
  });

  it('keeps the German river and station names in their own direction in Arabic, so they are cut at their end', async () => {
    data = {
      ...DATA,
      stations: [{ ...station('c', 512, 'normal'), name: 'Hamburg St. Pauli', waterBody: 'Elbe (Tideelbe)', tidal: true }],
    };
    await i18n.changeLanguage('ar');
    render(<WaterLevelStrip />);
    for (const text of ['Elbe (Tideelbe)', 'Hamburg St. Pauli']) {
      const el = screen.getByText(text);
      expect(el.getAttribute('dir')).toBe('auto');
      expect(el.className).toContain('truncate');
    }
    // The tidal badge is translated, so it stays out of the name's run and
    // follows the name in the page's direction.
    const badge = screen.getByText(i18n.t('panel.waterLevels.tidal'));
    expect(badge.closest('[dir="auto"]')).toBeNull();
  });
});
