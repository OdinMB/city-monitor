import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

let summary: PopulationSummary;

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/usePopulationSummary.js', () => ({
  usePopulationSummary: () => ({ data: summary, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

beforeEach(() => {
  summary = SUMMARY;
});

afterEach(async () => {
  vi.restoreAllMocks();
  cleanup();
  await i18n.changeLanguage('en');
});

describe('PopulationStrip numbers follow the UI language, not the browser', () => {
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

const ar = (n: number) => n.toLocaleString('ar');

describe('PopulationStrip rendered values', () => {
  it.each(['en', 'de', 'tr', 'ar'])('total, change line and density in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<PopulationStrip />);
    const n = (v: number) => v.toLocaleString(lang);
    expect(screen.getByText(n(3_850_809))).toBeTruthy();
    expect(screen.getByText(`+${n(12_345)} (+0.3%) ${i18n.t('panel.population.change')}`)).toBeTruthy();
    expect(screen.getByText(`${n(4_321)} ${i18n.t('panel.population.density')}`)).toBeTruthy();
  });

  // Shares keep one decimal with a point in every language.
  it.each(['en', 'de', 'tr', 'ar'])('foreign share and age slices in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    const { container } = render(<PopulationStrip />);
    expect(screen.getByText('24.1%')).toBeTruthy();
    const slices = [...container.querySelectorAll('svg text')].map((el) => el.textContent);
    expect(slices).toEqual(['16.8%', '63.9%', '19.3%']);
    const titles = [...container.querySelectorAll('svg title')].map((el) => el.textContent);
    expect(titles).toEqual([
      `${i18n.t('panel.population.youth')}: 16.8%`,
      `${i18n.t('panel.population.workingAge')}: 63.9%`,
      `${i18n.t('panel.population.elderly')}: 19.3%`,
    ]);
  });

  it.each([
    ['en', '-12,345 (-0.3%)'],
    ['de', '-12.345 (-0.3%)'],
    ['tr', '-12.345 (-0.3%)'],
    ['ar', `${ar(-12_345)} (-0.3%)`],
  ])('a fall reads with a minus in %s', async (lang, change) => {
    summary = { ...SUMMARY, changeAbsolute: -12_345, changePct: -0.3 };
    await i18n.changeLanguage(lang);
    const { container } = render(<PopulationStrip />);
    expect(container.textContent).toContain(change);
  });

  it('marks a change that rounds to no percent with a plus', () => {
    summary = { ...SUMMARY, changeAbsolute: 120, changePct: 0 };
    const { container } = render(<PopulationStrip />);
    expect(container.textContent).toContain('+120 (+0.0%) vs. previous half-year');
  });

  it('shows no change line when nothing changed', () => {
    summary = { ...SUMMARY, changeAbsolute: 0, changePct: 0 };
    const { container } = render(<PopulationStrip />);
    expect(container.textContent).not.toContain('vs. previous half-year');
  });
});
