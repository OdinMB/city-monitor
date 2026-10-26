import type { DwdUvForecast } from '@city-monitor/shared';

export interface UvLevel {
  level: 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';
  color: string;
}

export function getUvLevel(index: number): UvLevel {
  const floored = Math.floor(index);
  if (floored <= 2) return { level: 'low', color: '#4ade80' };
  if (floored <= 5) return { level: 'moderate', color: '#facc15' };
  if (floored <= 7) return { level: 'high', color: '#fb923c' };
  if (floored <= 10) return { level: 'veryHigh', color: '#ef4444' };
  return { level: 'extreme', color: '#a855f7' };
}

const DAY_MS = 86_400_000;

/** The calendar date ("YYYY-MM-DD") of `now` in `timeZone`. */
function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const p: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Today's UV index maximum from the DWD forecast, in the city's time zone.
 * DWD publishes once a day, so until its morning update the forecast still
 * starts at yesterday and today's value is its `tomorrow`. Returns null when
 * the forecast no longer covers today. Data without `forecastDay` is taken
 * as starting today.
 */
export function uvIndexForToday(
  forecast: DwdUvForecast | undefined,
  timeZone: string,
  now: Date = new Date(),
): number | null {
  if (!forecast) return null;
  if (!forecast.forecastDay) return forecast.today;
  const start = Date.parse(`${forecast.forecastDay}T00:00:00Z`);
  const today = Date.parse(`${localDate(now, timeZone)}T00:00:00Z`);
  if (Number.isNaN(start)) return forecast.today;
  const offset = Math.round((today - start) / DAY_MS);
  if (offset === 0) return forecast.today;
  if (offset === 1) return forecast.tomorrow;
  if (offset === 2) return forecast.dayAfter;
  return null;
}
