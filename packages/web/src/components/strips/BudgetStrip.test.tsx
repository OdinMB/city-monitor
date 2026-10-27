import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { BudgetSummary } from '../../lib/api.js';
import { isolate } from '../../lib/bidi.js';
import { BudgetStrip } from './BudgetStrip.js';

const DATA: BudgetSummary = {
  year: '2026',
  fetchedAt: '2026-10-26T08:00:00Z',
  areas: [
    {
      areaCode: -1,
      areaName: 'Berlin',
      revenues: [
        { code: 0, name: 'General', amount: 30_000_000_000 },
        { code: 8, name: 'Finance', amount: 8_500_000_000 },
      ],
      expenses: [
        { code: 1, name: 'Education', amount: 40_000_000_000 },
        { code: 2, name: 'Social', amount: 450_000_000 },
        { code: 7, name: 'Transport', amount: 12_400 },
        { code: 3, name: 'Health', amount: 500 },
      ],
      totalRevenue: 38_500_000_000,
      totalExpense: 40_450_012_900,
    },
    {
      areaCode: 31,
      areaName: 'Mitte',
      revenues: [],
      expenses: [{ code: 1, name: 'Education', amount: 1_500_000 }],
      totalRevenue: 0,
      totalExpense: 1_500_000,
    },
    {
      areaCode: 32,
      areaName: 'Pankow',
      revenues: [],
      expenses: [{ code: 2, name: 'Social', amount: 999 }],
      totalRevenue: 0,
      totalExpense: 999,
    },
  ],
};

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useBudget.js', () => ({
  useBudget: () => ({ data: DATA, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

const category = (code: number) => i18n.t(`panel.budget.category.${code}`);
const titles = (container: HTMLElement) => [...container.querySelectorAll('svg title')].map((el) => el.textContent);

/** Scale words for thousand, million and billion in each UI language. */
const SCALE: Record<string, { k: string; m: string; bn: string }> = {
  en: { k: 'K', m: 'M', bn: 'bn' },
  de: { k: 'Tsd.', m: 'Mio.', bn: 'Mrd.' },
  tr: { k: 'bin', m: 'Mn', bn: 'Mr' },
  ar: { k: 'ألف', m: 'مليون', bn: 'مليار' },
};

/**
 * Amounts are shortened with a point in every language and the scale word of
 * the UI language. An amount with its scale word, and a share with its %, is
 * one isolated run, so in Arabic the % stays after the number.
 */
describe('BudgetStrip amounts', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it.each(['en', 'de', 'tr', 'ar'])('city view in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    const { k, m, bn } = SCALE[lang]!;
    const { container } = render(<BudgetStrip />);

    expect(screen.getByRole('img', { name: `${i18n.t('panel.budget.revenues')}: ${isolate(`38.5 ${bn}`)}` })).toBeTruthy();
    expect(screen.getByRole('img', { name: `${i18n.t('panel.budget.expenses')}: ${isolate(`40.5 ${bn}`)}` })).toBeTruthy();
    expect(screen.getByText(isolate(`38.5 ${bn}`))).toBeTruthy();
    expect(screen.getAllByText(isolate(`40.5 ${bn}`))).toHaveLength(2); // pie centre and total budget
    expect(screen.getByText(isolate(`2.0 ${bn}`))).toBeTruthy(); // new debt

    expect(titles(container)).toEqual([
      `${category(0)}: ${isolate(`30.0 ${bn}`)} (${isolate('77.9%')})`,
      `${category(8)}: ${isolate(`8.5 ${bn}`)} (${isolate('22.1%')})`,
      `${category(1)}: ${isolate(`40.0 ${bn}`)} (${isolate('98.9%')})`,
      `${category(2)}: ${isolate(`450 ${m}`)} (${isolate('1.1%')})`,
      `${category(7)}: ${isolate(`12 ${k}`)} (${isolate('0.0%')})`,
      `${category(3)}: 500 (${isolate('0.0%')})`,
    ]);
  });

  it.each(['en', 'de', 'tr', 'ar'])('district view in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    const { m } = SCALE[lang]!;
    const { container } = render(<BudgetStrip />);
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('panel.budget.districts') }));

    expect(screen.getByRole('img', { name: `${i18n.t('panel.budget.expenses')}: ${isolate(`2 ${m}`)}` })).toBeTruthy();
    expect(screen.getByRole('img', { name: `${i18n.t('panel.budget.expenses')}: 999` })).toBeTruthy();
    expect(titles(container)).toEqual([
      `${category(1)}: ${isolate(`2 ${m}`)} (${isolate('100%')})`,
      `${category(2)}: 999 (${isolate('100%')})`,
    ]);
  });
});
