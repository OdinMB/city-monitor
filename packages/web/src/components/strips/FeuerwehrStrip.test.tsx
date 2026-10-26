import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { FeuerwehrMonthData, FeuerwehrSummary } from '../../lib/api.js';
import { FeuerwehrStrip } from './FeuerwehrStrip.js';

function month(reportMonth: string, missionCountAll: number, ems: number, fire: number): FeuerwehrMonthData {
  return {
    reportMonth,
    missionCountAll,
    missionCountEms: 0,
    missionCountFire: 0,
    missionCountTechnicalRescue: 0,
    responseTimeEmsCriticalMedian: ems,
    responseTimeFirePumpMedian: fire,
  };
}

const SUMMARY: FeuerwehrSummary = {
  current: month('2026-09', 34_567, 452, 61),
  partial: month('2026-10', 12_345, 440, 75),
  // +15.2 % missions, -3.4 % EMS time, no change in fire time
  previous: month('2026-08', 30_000, 468, 61),
};

let summary: FeuerwehrSummary;

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useFeuerwehr.js', () => ({
  useFeuerwehr: () => ({ data: summary, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

beforeEach(() => {
  summary = SUMMARY;
});

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

const count = (n: number, lang: string) => n.toLocaleString(lang);

/**
 * Mission counts are grouped in the UI language; response times read m:ss and
 * the month-on-month change keeps a point, in every language.
 */
describe.each([false, true])('FeuerwehrStrip numbers (expanded: %s)', (expanded) => {
  it.each(['en', 'de', 'tr', 'ar'])('%s', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<FeuerwehrStrip expanded={expanded} />);
    for (const text of [count(34_567, lang), count(12_345, lang), '7:32', '7:20', '1:01', '1:15', '+15%', '-3.4%', '0.0%']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });
});

describe('FeuerwehrStrip', () => {
  it('groups the counts the German way in German', async () => {
    await i18n.changeLanguage('de');
    render(<FeuerwehrStrip expanded />);
    expect(screen.getByText('34.567')).toBeTruthy();
    expect(screen.getByText('12.345')).toBeTruthy();
  });

  it.each([false, true])('formats the counts with the Arabic locale in Arabic (expanded: %s)', async (expanded) => {
    await i18n.changeLanguage('ar');
    const spy = vi.spyOn(Number.prototype, 'toLocaleString');
    render(<FeuerwehrStrip expanded={expanded} />);
    const locales = spy.mock.calls.map((args) => args[0]);
    spy.mockRestore();
    expect(locales).toEqual(['ar', 'ar']); // current and partial missions
  });

  it('shows one column of numbers when the month has no partial data yet', () => {
    summary = { ...SUMMARY, partial: null };
    render(<FeuerwehrStrip expanded />);
    expect(screen.getAllByText('Missions')).toHaveLength(1);
    expect(screen.getByText('34,567')).toBeTruthy();
    expect(screen.queryByText('12,345')).toBeNull();
  });
});
