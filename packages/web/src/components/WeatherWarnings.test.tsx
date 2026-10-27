import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import type { WeatherAlert } from '@city-monitor/shared';
import { WeatherWarningList } from './WeatherWarnings.js';

vi.mock('../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin', timezone: 'Europe/Berlin' }),
}));

// The browser's own zone must not matter: run in one that is neither UTC nor Berlin.
let savedTz: string | undefined;
beforeAll(() => {
  savedTz = process.env.TZ;
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

function alert(overrides: Partial<WeatherAlert> = {}): WeatherAlert {
  return {
    headline: 'Amtliche WARNUNG vor STURMBÖEN',
    severity: 'moderate',
    description: 'Es treten Sturmböen um 70 km/h auf.',
    // 16:00 UTC is 18:00 in Berlin (CEST)
    validUntil: '2026-07-15T16:00:00.000Z',
    ...overrides,
  };
}

describe('WeatherWarningList', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T09:30:00Z'));
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  it('renders nothing without warnings', () => {
    const { container } = render(<WeatherWarningList alerts={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it("shows each warning's level, end on Berlin's clock, headline and source", () => {
    render(<WeatherWarningList alerts={[alert({ severity: 'severe' })]} />);
    const row = within(screen.getByRole('list', { name: 'Alerts' })).getByRole('listitem');
    expect(within(row).getByText('Severe weather warning')).toBeTruthy();
    expect(within(row).getByText('Until 18:00')).toBeTruthy();
    expect(within(row).getByText('Amtliche WARNUNG vor STURMBÖEN')).toBeTruthy();
    expect(within(row).getByText('Source: Deutscher Wetterdienst (DWD)')).toBeTruthy();
  });

  it('marks the headline as German, the language DWD issues it in, isolated from the layout direction', () => {
    render(<WeatherWarningList alerts={[alert()]} />);
    const headline = screen.getByText('Amtliche WARNUNG vor STURMBÖEN');
    expect(headline.tagName).toBe('BDI');
    expect(headline.getAttribute('lang')).toBe('de');
  });

  it('says until further notice when the warning has no end', () => {
    render(<WeatherWarningList alerts={[alert({ validUntil: '' })]} />);
    expect(screen.getByText('Until further notice')).toBeTruthy();
  });

  it('lists every warning', () => {
    render(<WeatherWarningList alerts={[alert(), alert({ severity: 'extreme', headline: 'Amtliche WARNUNG vor ORKANBÖEN' })]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Significant weather warning')).toBeTruthy();
    expect(screen.getByText('Extreme weather warning')).toBeTruthy();
  });

  it.each([
    ['de', 'Markante Wetterwarnung', 'Unwetterwarnung', 'Extremes Unwetter', 'Quelle: Deutscher Wetterdienst (DWD)', 'Bis 18:00 Uhr'],
    ['en', 'Significant weather warning', 'Severe weather warning', 'Extreme weather warning', 'Source: Deutscher Wetterdienst (DWD)', 'Until 18:00'],
    ['tr', 'Önemli hava uyarısı', 'Şiddetli hava uyarısı', 'Aşırı şiddetli hava uyarısı', 'Kaynak: Deutscher Wetterdienst (DWD)', 'Bitiş: 18:00'],
    ['ar', 'تحذير جوي هام', 'تحذير من طقس شديد', 'تحذير من طقس متطرف', 'المصدر: هيئة الأرصاد الجوية الألمانية (DWD)', 'حتى الساعة 18:00'],
  ])('names each level, the source and the end in the reader\'s language (%s)', async (lang, moderate, severe, extreme, source, until) => {
    await i18n.changeLanguage(lang);
    render(
      <WeatherWarningList
        alerts={[alert({ severity: 'moderate' }), alert({ severity: 'severe' }), alert({ severity: 'extreme' })]}
      />,
    );
    expect(screen.getByText(moderate)).toBeTruthy();
    expect(screen.getByText(severe)).toBeTruthy();
    expect(screen.getByText(extreme)).toBeTruthy();
    expect(screen.getAllByText(source)).toHaveLength(3);
    expect(screen.getAllByText(until)).toHaveLength(3);
  });

  it('hides a warning more than five minutes past its end, and keeps one just past it', () => {
    // now is 09:30 UTC
    render(
      <WeatherWarningList
        alerts={[
          alert({ severity: 'extreme', validUntil: '2026-07-15T09:24:00.000Z' }),
          alert({ severity: 'severe', validUntil: '2026-07-15T09:26:00.000Z' }),
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Severe weather warning')).toBeTruthy();
    expect(screen.queryByText('Extreme weather warning')).toBeNull();
  });

  it('renders nothing when every warning has run out', () => {
    const { container } = render(<WeatherWarningList alerts={[alert({ validUntil: '2026-07-15T08:00:00.000Z' })]} />);
    expect(container.innerHTML).toBe('');
  });

  it('calls a warning of unknown severity a weather warning, claiming no level', () => {
    render(<WeatherWarningList alerts={[alert({ severity: 'minor' })]} />);
    expect(screen.getByText('Weather warning')).toBeTruthy();
  });

  it.each([
    // The level badge carries the level's colour (DWD: orange, red, violet).
    // Its 12px text needs 4.5:1 (WCAG 1.4.3); the badge is the same in both themes.
    ['moderate', 'Significant weather warning', ['bg-orange-500', 'text-gray-950']], // 7.0:1
    ['severe', 'Severe weather warning', ['bg-red-700', 'text-white']], // 6.4:1
    ['extreme', 'Extreme weather warning', ['bg-purple-700', 'text-white']], // 7.1:1
    ['minor', 'Weather warning', ['bg-orange-500', 'text-gray-950']],
  ])('colours the %s badge with text at 4.5:1', (severity, label, classes) => {
    render(<WeatherWarningList alerts={[alert({ severity })]} />);
    const badge = screen.getByText(label);
    for (const cls of classes) expect(badge.classList.contains(cls), badge.className).toBe(true);
  });

  it.each([
    // Row text on the level's tint: gray-900/gray-700 on the 50 shade (9.4:1 or more),
    // gray-100/gray-300 on the 950 shade in the dark theme (10.2:1 or more).
    ['moderate', ['bg-orange-50', 'dark:bg-orange-950']],
    ['severe', ['bg-red-50', 'dark:bg-red-950']],
    ['extreme', ['bg-purple-50', 'dark:bg-purple-950']],
  ])('tints the %s row and keeps its text at 4.5:1', (severity, classes) => {
    render(<WeatherWarningList alerts={[alert({ severity })]} />);
    const row = screen.getByRole('listitem');
    for (const cls of classes) expect(row.classList.contains(cls), row.className).toBe(true);
    for (const text of ['Until 18:00', 'Source: Deutscher Wetterdienst (DWD)']) {
      const el = screen.getByText(text);
      expect(el.classList.contains('text-gray-700'), el.className).toBe(true);
      expect(el.classList.contains('dark:text-gray-300'), el.className).toBe(true);
    }
    const headline = screen.getByText('Amtliche WARNUNG vor STURMBÖEN').closest('p')!;
    expect(headline.classList.contains('text-gray-900')).toBe(true);
    expect(headline.classList.contains('dark:text-gray-100')).toBe(true);
  });
});

describe('WeatherWarningList on a page left open', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-07-15T15:50:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('drops a warning five minutes after its end, without new data', () => {
    // Ends 16:00 UTC; the page was opened at 15:50
    render(<WeatherWarningList alerts={[alert(), alert({ severity: 'severe', validUntil: '' })]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    act(() => vi.advanceTimersByTime(14 * 60_000));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Severe weather warning')).toBeTruthy();
  });
});
