import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

describe('BathingStrip German names in Arabic', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('runs the spot name in its own direction, so truncate cuts it at its end', async () => {
    await i18n.changeLanguage('ar');
    render(<BathingStrip />);
    for (const name of screen.getAllByText(/^Spot /)) {
      expect(name.getAttribute('dir')).toBe('auto');
      expect(name.classList.contains('truncate')).toBe(true);
    }
  });

  it('keeps the water body and temperature in one run whose direction the temperature\'s margin follows', async () => {
    // In the Arabic page the span's ms-1.5 resolved to a right margin while
    // bidi laid out "Wannsee 21°C" left to right: "Wannsee21°C".
    await i18n.changeLanguage('ar');
    render(<BathingStrip />);
    const temp = screen.getAllByText('21°C')[0];
    expect(temp.classList.contains('ms-1.5')).toBe(true);
    const run = temp.closest('[dir]')!;
    expect(run.getAttribute('dir')).toBe('auto');
    expect(run.textContent).toBe('Wannsee21°C');
    expect(run.classList.contains('truncate')).toBe(true);
    // Only as wide as its text, so it stays at the row's start beside the quality dot.
    expect(run.parentElement!.classList.contains('flex')).toBe(true);
  });
});
