import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDayName } from './format-day-name.js';

describe('formatDayName', () => {
  it('returns a short weekday name for a known date', () => {
    // 2024-01-01 is a Monday
    const result = formatDayName('2024-01-01', 'en-US');
    expect(result).toBe('Mon');
  });

  it('returns todayLabel when date is today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = formatDayName(today, 'en-US', 'Today', 'Tomorrow');
    expect(result).toBe('Today');
  });

  it('returns tomorrowLabel when date is tomorrow', () => {
    const tomorrow = new Date(Date.now() + 86400_000);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const result = formatDayName(tomorrowStr, 'en-US', 'Today', 'Tomorrow');
    expect(result).toBe('Tomorrow');
  });

  describe('in a time zone', () => {
    let savedTz: string | undefined;
    beforeEach(() => {
      // The browser's own zone must not matter: run in one that is neither UTC nor Berlin.
      savedTz = process.env.TZ;
      process.env.TZ = 'America/New_York';
      vi.useFakeTimers({ toFake: ['Date'] });
    });
    afterEach(() => {
      vi.useRealTimers();
      if (savedTz === undefined) delete process.env.TZ;
      else process.env.TZ = savedTz;
    });

    it.each([
      // 00:30 on 16 July in Berlin (CEST), still 15 July in UTC
      ['summer (CEST)', '2026-07-15T22:30:00Z', '2026-07-15', '2026-07-16', '2026-07-17', 'Wed'],
      // 00:30 on 16 January in Berlin (CET), still 15 January in UTC
      ['winter (CET)', '2026-01-15T23:30:00Z', '2026-01-15', '2026-01-16', '2026-01-17', 'Thu'],
    ])('counts today in that zone in %s', (_season, now, yesterday, today, tomorrow, yesterdayName) => {
      vi.setSystemTime(new Date(now));
      const name = (date: string) => formatDayName(date, 'en-US', 'Today', 'Tomorrow', 'Europe/Berlin');
      expect(name(yesterday)).toBe(yesterdayName);
      expect(name(today)).toBe('Today');
      expect(name(tomorrow)).toBe('Tomorrow');
    });
  });

  it('returns a string on invalid input (does not throw)', () => {
    const result = formatDayName('not-a-date', 'en-US');
    // Should return something without throwing — either the raw dateStr
    // or the locale-formatted "Invalid Date" string depending on the engine
    expect(typeof result).toBe('string');
  });

  it('returns weekday when no labels are provided', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = formatDayName(today, 'en-US');
    // Should return a short weekday, not "Today"
    expect(result).not.toBe('Today');
    expect(result.length).toBeGreaterThan(0);
  });
});
