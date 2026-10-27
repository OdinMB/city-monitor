import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { LaborMarketSummary } from '../../lib/api.js';
import { isolate } from '../../lib/bidi.js';
import { LaborMarketStrip } from './LaborMarketStrip.js';

const SUMMARY: LaborMarketSummary = {
  unemploymentRate: 9.8,
  totalUnemployed: 201_234,
  yoyChangeAbsolute: 9_500,
  yoyChangePercent: 5,
  sgbIIRate: 15.04,
  sgbIICount: 1_234,
  sgbIIYoyAbsolute: 0,
  sgbIIYoyPercent: 0,
  underemploymentRate: 12,
  underemploymentCount: 260_500,
  underemploymentYoyAbsolute: -4_000,
  underemploymentYoyPercent: -1.5,
  reportMonth: '2026-09',
};

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useLaborMarket.js', () => ({
  useLaborMarket: () => ({ data: SUMMARY, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

const count = (n: number, lang: string) => n.toLocaleString(lang);

describe('LaborMarketStrip numbers', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  // Rates keep one decimal with a point in every language; counts are grouped
  // in the UI language; the year-on-year change is signed, whole when whole.
  // Each rate and change is one isolated run, so in Arabic the sign and %
  // stay on their sides ("-1.5%").
  it.each(['en', 'de', 'tr', 'ar'])('%s', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<LaborMarketStrip />);
    const yoy = i18n.t('panel.laborMarket.yoy');

    expect(screen.getByText(isolate('9.8%'))).toBeTruthy();
    expect(screen.getByText(isolate('12.0%'))).toBeTruthy();
    expect(screen.getByText(isolate('15.0%'))).toBeTruthy();

    expect(screen.getByText(count(201_234, lang))).toBeTruthy();
    expect(screen.getByText(count(260_500, lang))).toBeTruthy();
    expect(screen.getByText(count(1_234, lang))).toBeTruthy();

    expect(screen.getByText(`${isolate('+5%')} ${yoy}`)).toBeTruthy();
    expect(screen.getByText(`${isolate('-1.5%')} ${yoy}`)).toBeTruthy();
    expect(screen.getByText(`${isolate('0%')} ${yoy}`)).toBeTruthy();
  });

  it('groups counts the German way in German', async () => {
    await i18n.changeLanguage('de');
    render(<LaborMarketStrip />);
    expect(screen.getByText('201.234')).toBeTruthy();
    expect(screen.getByText('1.234')).toBeTruthy();
  });

  it('formats the counts with the Arabic locale in Arabic', async () => {
    await i18n.changeLanguage('ar');
    const spy = vi.spyOn(Number.prototype, 'toLocaleString');
    render(<LaborMarketStrip />);
    const locales = spy.mock.calls.map((args) => args[0]);
    spy.mockRestore();
    expect(locales).toEqual(['ar', 'ar', 'ar']);
  });
});
