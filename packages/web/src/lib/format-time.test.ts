import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import { formatRelativeTimeI18n } from './format-time.js';

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTimeI18n', () => {
  const cases = {
    en: { justNow: 'just now', minutes: '5 min ago', hours: '3h ago', days: '2d ago' },
    de: { justNow: 'gerade eben', minutes: 'vor 5 Min.', hours: 'vor 3 Std.', days: 'vor 2 T.' },
    tr: { justNow: 'az önce', minutes: '5 dk önce', hours: '3 sa önce', days: '2 gün önce' },
    ar: { justNow: 'الآن', minutes: 'منذ 5 دقائق', hours: 'منذ 3 ساعات', days: 'منذ يومين' },
  } as const;

  it.each(Object.keys(cases) as (keyof typeof cases)[])('formats in the given language (%s)', (lang) => {
    const t = i18n.getFixedT(lang);
    const expected = cases[lang];
    expect(formatRelativeTimeI18n(ago(30_000), t)).toBe(expected.justNow);
    expect(formatRelativeTimeI18n(ago(5 * MIN), t)).toBe(expected.minutes);
    expect(formatRelativeTimeI18n(ago(3 * HOUR), t)).toBe(expected.hours);
    expect(formatRelativeTimeI18n(ago(2 * DAY), t)).toBe(expected.days);
  });

  it('treats a future timestamp as just now', () => {
    expect(formatRelativeTimeI18n(ago(-5 * MIN), i18n.getFixedT('en'))).toBe('just now');
  });

  it('handles invalid dates gracefully', () => {
    const t = i18n.getFixedT('en');
    expect(formatRelativeTimeI18n('', t)).toBe('');
    expect(formatRelativeTimeI18n('not-a-date', t)).toBe('');
  });
});

describe('formatRelativeTimeI18n in Arabic', () => {
  const t = i18n.getFixedT('ar');

  it.each([
    [1 * MIN, 'منذ دقيقة'],
    [2 * MIN, 'منذ دقيقتين'],
    [4 * MIN, 'منذ 4 دقائق'],
    [45 * MIN, 'منذ 45 دقيقة'],
    [1 * HOUR, 'منذ ساعة'],
    [2 * HOUR, 'منذ ساعتين'],
    [6 * HOUR, 'منذ 6 ساعات'],
    [13 * HOUR, 'منذ 13 ساعة'],
    [1 * DAY, 'منذ يوم'],
    [3 * DAY, 'منذ 3 أيام'],
    [11 * DAY, 'منذ 11 يومًا'],
  ])('%i ms ago uses the matching plural form', (ms, expected) => {
    expect(formatRelativeTimeI18n(ago(ms), t)).toBe(expected);
  });
});
