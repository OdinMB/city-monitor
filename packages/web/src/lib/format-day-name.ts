import { cityDate } from './city-time.js';

/**
 * Format a date string (YYYY-MM-DD) as a short weekday name.
 * Optionally returns todayLabel/tomorrowLabel when the date is today or
 * tomorrow in `timeZone` (the city's zone; UTC when not given).
 */
export function formatDayName(
  dateStr: string,
  locale: string,
  todayLabel?: string,
  tomorrowLabel?: string,
  timeZone = 'UTC',
): string {
  try {
    const date = new Date(dateStr + 'T00:00:00Z');

    if (todayLabel || tomorrowLabel) {
      const today = Date.parse(`${cityDate(Date.now(), timeZone)}T00:00:00Z`);
      const diff = (date.getTime() - today) / 86400_000;
      if (todayLabel && diff >= 0 && diff < 1) return todayLabel;
      if (tomorrowLabel && diff >= 1 && diff < 2) return tomorrowLabel;
    }

    return date.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}
