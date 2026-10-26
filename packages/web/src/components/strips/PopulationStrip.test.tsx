import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import i18n from 'i18next';
import type { PopulationSummary } from '../../lib/api.js';
import { PopulationStrip } from './PopulationStrip.js';

const SUMMARY: PopulationSummary = {
  total: 3_850_809,
  density: 4_321,
  foreignTotal: 928_000,
  foreignPct: 24.1,
  elderlyPct: 19.3,
  youthPct: 16.8,
  workingAgePct: 63.9,
  changeAbsolute: 12_345,
  changePct: 0.3,
  snapshotDate: '2025-12-31',
};

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/usePopulationSummary.js', () => ({
  usePopulationSummary: () => ({ data: SUMMARY, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe('PopulationStrip numbers follow the UI language, not the browser', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    cleanup();
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', '3,850,809', '+12,345 (+0.3%)', '4,321 per km²'],
    ['de', '3.850.809', '+12.345 (+0.3%)', '4.321 pro km²'],
    ['tr', '3.850.809', '+12.345 (+0.3%)', '4.321 km² başına'],
  ])('%s', async (lang, total, change, density) => {
    await i18n.changeLanguage(lang);
    const { container } = render(<PopulationStrip />);
    const text = container.textContent!;
    expect(text).toContain(total);
    expect(text).toContain(change);
    expect(text).toContain(density);
  });

  // ICU's Arabic grouping can match the test machine's default (Latin digits,
  // comma groups), so the output alone can't show which locale was used.
  it('formats the counts with the Arabic locale in Arabic', async () => {
    await i18n.changeLanguage('ar');
    const spy = vi.spyOn(Number.prototype, 'toLocaleString');
    render(<PopulationStrip />);
    const locales = spy.mock.calls.map((args) => args[0]);
    expect(locales).toHaveLength(3); // total, change, density
    expect(locales.every((l) => l === 'ar')).toBe(true);
  });
});
