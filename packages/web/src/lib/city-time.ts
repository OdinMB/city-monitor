/**
 * Clock and calendar in the city's time zone (`CityConfig.timezone`),
 * whatever zone the browser is in, and the instants of hourly forecast times.
 */

const MINUTE_MS = 60_000;

/** Hourly forecast `time` values that already say which zone they are in. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * The instant (ms since the epoch) of an hourly forecast `time`. The server
 * writes it in UTC without an offset ("2026-07-15T12:00"), as the BrightSky
 * adapter and the synthetic data do; a time ending in "Z" or an offset is
 * read as written. NaN when `time` is not a time.
 */
export function forecastInstant(time: string): number {
  return Date.parse(HAS_OFFSET.test(time) ? time : `${time}Z`);
}

/**
 * The hourly entries from the current minute on: an entry for 12:00 still
 * counts until 12:01. Entries whose time cannot be read are left out.
 */
export function upcomingHourly<T extends { time: string }>(hourly: T[], now: Date | number): T[] {
  const minute = Math.floor(new Date(now).getTime() / MINUTE_MS) * MINUTE_MS;
  return hourly.filter((h) => forecastInstant(h.time) >= minute);
}

interface CityParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function cityParts(at: Date | number, timeZone: string): CityParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const p: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return p as unknown as CityParts;
}

/** The calendar date ("YYYY-MM-DD") of an instant in `timeZone`. */
export function cityDate(at: Date | number, timeZone: string): string {
  const p = cityParts(at, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The hour (0–23) of an instant on the clocks of `timeZone`. */
export function cityHour(at: Date | number, timeZone: string): number {
  return Number(cityParts(at, timeZone).hour);
}

/** The 24-hour clock time ("14:00") of an instant in `timeZone`, in Latin digits in every language. */
export function formatCityClock(at: Date | number, timeZone: string): string {
  const p = cityParts(at, timeZone);
  return `${p.hour}:${p.minute}`;
}
