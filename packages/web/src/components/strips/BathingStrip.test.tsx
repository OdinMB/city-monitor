import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import i18n from 'i18next';
import type { BathingSpot } from '../../lib/api.js';
import { BathingStrip } from './BathingStrip.js';

function spot(id: string, measuredAt: string): BathingSpot {
  return {
    id, name: `Spot ${id}`, district: 'Steglitz-Zehlendorf', waterBody: 'Wannsee', lat: 52.4, lon: 13.2,
    measuredAt, waterTemp: 21, visibility: 1.5, quality: 'good', algae: null, advisory: null,
    classification: 'ausgezeichnet', detailUrl: 'https://www.berlin.de/lageso/', inSeason: true,
  };
}

// The footer shows the most recent measurement: 25 August 2026.
const SPOTS = [spot('a', '2026-08-20'), spot('b', '2026-08-25')];

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useBathing.js', () => ({
  useBathing: () => ({ data: SPOTS, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe('BathingStrip measurement date follows the UI language, not the browser', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', 'Measured: Aug 25, 2026'],
    ['de', 'Gemessen: 25. Aug. 2026'],
    ['tr', 'Ölçüm: 25 Ağu 2026'],
    // Arabic digits and marks come from ICU, so the date is built the way the
    // other tiles build it; the month is named in Arabic (أغسطس).
    ['ar', `القياس: ${new Date('2026-08-25T00:00:00Z').toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`],
  ])('%s', async (lang, footer) => {
    await i18n.changeLanguage(lang);
    const { container } = render(<BathingStrip />);
    expect(container.textContent).toContain(footer);
    if (lang === 'ar') expect(container.textContent).toContain('أغسطس');
  });
});
