import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import { formatClockTime, formatRelativeTimeI18n } from './format-time.js';

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

describe('formatClockTime', () => {
  const BERLIN = 'Europe/Berlin';
  const now = Date.parse('2026-10-27T06:20:00Z'); // 07:20 in Berlin (CET)

  it('gives the time on the city clock, not the browser clock', () => {
    expect(formatClockTime('2026-10-27T06:12:00Z', 'en', BERLIN, now)).toBe('07:12');
    expect(formatClockTime('2026-10-27T06:12:00Z', 'en', 'Asia/Tokyo', now)).toBe('15:12');
  });

  it('follows summer time', () => {
    expect(formatClockTime('2026-07-01T05:12:00Z', 'de', BERLIN, Date.parse('2026-07-01T05:20:00Z'))).toBe('07:12');
  });

  it('uses a 24-hour clock in every language', () => {
    const afternoon = '2026-10-27T14:05:00Z';
    const later = Date.parse('2026-10-27T14:10:00Z');
    expect(formatClockTime(afternoon, 'en', BERLIN, later)).toBe('15:05');
    expect(formatClockTime(afternoon, 'de', BERLIN, later)).toBe('15:05');
    expect(formatClockTime(afternoon, 'tr', BERLIN, later)).toBe('15:05');
    expect(formatClockTime(afternoon, 'ar', BERLIN, later)).toBe(
      new Date(afternoon).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: BERLIN }),
    );
  });

  it('decides "today" on the city clock', () => {
    // 00:30 and 01:00 in Berlin are the same day, though in UTC 23:30 is the day before.
    expect(formatClockTime('2026-10-26T23:30:00Z', 'en', BERLIN, Date.parse('2026-10-27T00:00:00Z'))).toBe('00:30');
  });

  it('adds the date when the time is not from today', () => {
    const twoDaysAgo = '2026-10-25T04:12:00Z'; // 05:12 in Berlin, the day summer time ended
    const text = formatClockTime(twoDaysAgo, 'de', BERLIN, now);
    expect(text).toBe(
      new Date(twoDaysAgo).toLocaleString('de', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: BERLIN }),
    );
    expect(text).toContain('05:12');
    expect(text).toContain('25');
    expect(text).not.toBe('05:12');
  });

  it('handles invalid dates gracefully', () => {
    expect(formatClockTime('', 'en', BERLIN, now)).toBe('');
    expect(formatClockTime('not-a-date', 'en', BERLIN, now)).toBe('');
  });
});
