import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import i18n from 'i18next';
import {
  WARNING_END_GRACE_MS,
  formatWarningEnd,
  highestWarningLevel,
  nextWarningExpiry,
  warningLevel,
  warningsInForce,
} from './weather-warnings.js';

const BERLIN = 'Europe/Berlin';
const utc = (iso: string) => Date.parse(`${iso}Z`);

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

describe('warningLevel', () => {
  it.each([
    ['moderate', 'moderate'],
    ['severe', 'severe'],
    ['extreme', 'extreme'],
    ['minor', 'unknown'],
    ['', 'unknown'],
  ])('reads severity %j as level %s', (severity, level) => {
    expect(warningLevel(severity)).toBe(level);
  });
});

describe('highestWarningLevel', () => {
  it('is null without warnings', () => {
    expect(highestWarningLevel([])).toBeNull();
  });

  it('names the most serious level in force', () => {
    expect(highestWarningLevel([{ severity: 'moderate' }, { severity: 'extreme' }, { severity: 'severe' }])).toBe('extreme');
    expect(highestWarningLevel([{ severity: 'moderate' }, { severity: 'severe' }])).toBe('severe');
  });

  it('ranks a warning of unknown severity below the known levels', () => {
    expect(highestWarningLevel([{ severity: 'other' }])).toBe('unknown');
    expect(highestWarningLevel([{ severity: 'other' }, { severity: 'moderate' }])).toBe('moderate');
  });
});

describe('warningsInForce', () => {
  const MIN = 60_000;
  const now = utc('2026-07-15T18:00');
  const endingAt = (ms: number) => ({ validUntil: new Date(ms).toISOString() });

  it('allows a few minutes past the end, for a device clock that runs a little fast', () => {
    expect(WARNING_END_GRACE_MS).toBe(5 * MIN);
  });

  it('keeps warnings without an end, ahead of their end or within the grace after it', () => {
    const noEnd = { validUntil: '' };
    const unreadable = { validUntil: 'soon' };
    const ahead = endingAt(now + 60 * MIN);
    const justEnded = endingAt(now - 4 * MIN);
    expect(warningsInForce([noEnd, unreadable, ahead, justEnded], now)).toEqual([noEnd, unreadable, ahead, justEnded]);
  });

  it('drops warnings whose end is more than the grace in the past', () => {
    const ended = endingAt(now - 6 * MIN);
    const atGrace = endingAt(now - 5 * MIN);
    const longAgo = endingAt(now - 75 * MIN);
    const ahead = endingAt(now + MIN);
    expect(warningsInForce([ended, atGrace, longAgo, ahead], now)).toEqual([ahead]);
  });
});

describe('nextWarningExpiry', () => {
  const MIN = 60_000;
  const t0 = utc('2026-07-15T18:00');

  it('is the earliest end plus the grace', () => {
    const alerts = [
      { validUntil: '' },
      { validUntil: new Date(t0 + 60 * MIN).toISOString() },
      { validUntil: new Date(t0 + 10 * MIN).toISOString() },
    ];
    expect(nextWarningExpiry(alerts)).toBe(t0 + 10 * MIN + WARNING_END_GRACE_MS);
  });

  it('is null when no warning has an end', () => {
    expect(nextWarningExpiry([])).toBeNull();
    expect(nextWarningExpiry([{ validUntil: '' }, { validUntil: 'soon' }])).toBeNull();
  });
});

describe("formatWarningEnd on the city's clock", () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  const end = (validUntil: string, now: number, lang = 'en') =>
    formatWarningEnd(validUntil, now, BERLIN, lang, i18n.getFixedT(lang));

  it.each([
    // 16:00 UTC is 18:00 in Berlin (CEST)
    ['summer (CEST)', '2026-07-15', '18:00'],
    // 16:00 UTC is 17:00 in Berlin (CET)
    ['winter (CET)', '2026-01-15', '17:00'],
  ])('gives the end time on Berlin clocks when it ends today, in %s', (_season, day, clock) => {
    expect(end(`${day}T16:00:00.000Z`, utc(`${day}T09:30`))).toBe(`Until ${clock}`);
  });

  it("says tomorrow when the end is after Berlin's midnight, while UTC is still on the same day", () => {
    // 21:30 UTC is 23:30 in Berlin; 22:30 UTC is 00:30 on the next Berlin day
    expect(end('2026-07-15T22:30:00.000Z', utc('2026-07-15T21:30'))).toBe('Until tomorrow, 00:30');
  });

  it("says today when the end is still on Berlin's day, while UTC is already on the next one", () => {
    // 22:30 UTC on the 15th is 00:30 on the 16th in Berlin; 04:00 UTC on the 16th is 06:00 there
    expect(end('2026-07-16T04:00:00.000Z', utc('2026-07-15T22:30'))).toBe('Until 06:00');
  });

  it('names the weekday and date of a later day', () => {
    // 04:00 UTC on Friday 17 July is 06:00 in Berlin
    const text = end('2026-07-17T04:00:00.000Z', utc('2026-07-15T09:30'));
    expect(text).toMatch(/^Until Fri, .*17.*, 06:00$/);
  });

  it.each([
    ['en', 'Until 18:00', 'Until tomorrow, 06:00', 'Until further notice'],
    ['de', 'Bis 18:00 Uhr', 'Bis morgen, 06:00 Uhr', 'Bis auf Weiteres'],
    ['tr', 'Bitiş: 18:00', 'Bitiş: yarın 06:00', 'İkinci bir duyuruya kadar'],
    ['ar', 'حتى الساعة 18:00', 'حتى الساعة 06:00 غداً', 'حتى إشعار آخر'],
  ])('says it in the reader\'s language (%s)', (lang, today, tomorrow, noEnd) => {
    const now = utc('2026-07-15T09:30');
    expect(end('2026-07-15T16:00:00.000Z', now, lang)).toBe(today);
    expect(end('2026-07-16T04:00:00.000Z', now, lang)).toBe(tomorrow);
    expect(end('', now, lang)).toBe(noEnd);
  });

  it('writes the date of a later day in Latin digits in Arabic', () => {
    const text = end('2026-07-17T04:00:00.000Z', utc('2026-07-15T09:30'), 'ar');
    expect(text).toContain('17');
    expect(text).toContain('06:00');
    expect(text).not.toMatch(/[٠-٩]/);
  });

  it('reads an end it cannot parse as having no end', () => {
    expect(end('soon', utc('2026-07-15T09:30'))).toBe('Until further notice');
  });
});
