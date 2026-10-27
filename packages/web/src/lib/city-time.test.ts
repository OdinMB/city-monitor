import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cityDate, cityHour, forecastInstant, formatCityClock, upcomingHourly } from './city-time.js';

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

describe('test environment', () => {
  it('runs in a time zone that is neither UTC nor the city', () => {
    expect(new Date(utc('2026-07-15T12:00')).getHours()).toBe(8);
  });
});

describe('forecastInstant', () => {
  it('reads a time without an offset as UTC', () => {
    expect(forecastInstant('2026-07-15T12:00')).toBe(Date.UTC(2026, 6, 15, 12));
    expect(forecastInstant('2026-01-15T12:00')).toBe(Date.UTC(2026, 0, 15, 12));
  });

  it('reads a time with "Z" or an offset as written', () => {
    expect(forecastInstant('2026-07-15T12:00Z')).toBe(Date.UTC(2026, 6, 15, 12));
    expect(forecastInstant('2026-07-15T14:00+02:00')).toBe(Date.UTC(2026, 6, 15, 12));
    expect(forecastInstant('2026-07-15T12:00:00.000Z')).toBe(Date.UTC(2026, 6, 15, 12));
  });

  it('gives NaN for something that is not a time', () => {
    expect(forecastInstant('not-a-time')).toBeNaN();
  });
});

describe('formatCityClock', () => {
  it("shows the city's clock in summer (CEST, UTC+2)", () => {
    expect(formatCityClock(utc('2026-07-15T12:00'), BERLIN)).toBe('14:00');
  });

  it("shows the city's clock in winter (CET, UTC+1)", () => {
    expect(formatCityClock(utc('2026-01-15T12:00'), BERLIN)).toBe('13:00');
  });

  it('writes midnight as 00:00', () => {
    expect(formatCityClock(utc('2026-07-15T22:00'), BERLIN)).toBe('00:00');
    expect(formatCityClock(utc('2026-01-15T23:00'), BERLIN)).toBe('00:00');
  });

  it('shows the repeated hour when the clocks go back', () => {
    // 2026-10-25: 03:00 CEST becomes 02:00 CET
    const hours = ['2026-10-24T23:00', '2026-10-25T00:00', '2026-10-25T01:00', '2026-10-25T02:00'];
    expect(hours.map((h) => formatCityClock(utc(h), BERLIN))).toEqual(['01:00', '02:00', '02:00', '03:00']);
  });

  it('skips the missing hour when the clocks go forward', () => {
    // 2026-03-29: 02:00 CET becomes 03:00 CEST
    const hours = ['2026-03-29T00:00', '2026-03-29T01:00', '2026-03-29T02:00'];
    expect(hours.map((h) => formatCityClock(utc(h), BERLIN))).toEqual(['01:00', '03:00', '04:00']);
  });

  it('accepts a Date', () => {
    expect(formatCityClock(new Date(utc('2026-07-15T12:30')), BERLIN)).toBe('14:30');
  });
});

describe('cityHour', () => {
  it("gives the hour on the city's clock", () => {
    expect(cityHour(utc('2026-07-15T12:00'), BERLIN)).toBe(14);
    expect(cityHour(utc('2026-01-15T12:00'), BERLIN)).toBe(13);
    expect(cityHour(utc('2026-07-15T22:00'), BERLIN)).toBe(0);
  });
});

describe('cityDate', () => {
  it("gives the city's date after its midnight while UTC is still on the day before", () => {
    expect(cityDate(utc('2026-07-15T22:30'), BERLIN)).toBe('2026-07-16');
    expect(cityDate(utc('2026-01-15T23:30'), BERLIN)).toBe('2026-01-16');
  });

  it("gives the city's date before its midnight", () => {
    expect(cityDate(utc('2026-07-15T21:30'), BERLIN)).toBe('2026-07-15');
    expect(cityDate(utc('2026-01-15T22:30'), BERLIN)).toBe('2026-01-15');
  });
});

describe('upcomingHourly', () => {
  const hourly = ['2026-07-15T09:00', '2026-07-15T10:00', '2026-07-15T11:00'].map((time) => ({ time }));

  it('keeps the entries from the current minute on', () => {
    expect(upcomingHourly(hourly, utc('2026-07-15T09:30')).map((h) => h.time)).toEqual(['2026-07-15T10:00', '2026-07-15T11:00']);
  });

  it('keeps an entry during its first minute', () => {
    expect(upcomingHourly(hourly, utc('2026-07-15T10:00') + 45_000).map((h) => h.time)).toEqual(['2026-07-15T10:00', '2026-07-15T11:00']);
  });

  it('drops entries whose time cannot be read', () => {
    expect(upcomingHourly([{ time: 'not-a-time' }, ...hourly], utc('2026-07-15T08:00'))).toEqual(hourly);
  });
});
