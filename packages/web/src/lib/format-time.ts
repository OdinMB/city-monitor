import type { TFunction } from 'i18next';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/**
 * Relative time ("5 min ago", "vor 5 Min.", "5 dk önce") in the UI language,
 * from the `time.*` translation keys. Future timestamps read as "just now".
 * The result already carries its "ago" word, so a sentence that embeds it
 * must not add one. The count picks the plural form (six in Arabic).
 */
export function formatRelativeTimeI18n(isoString: string, t: TFunction): string {
  if (!isoString) return '';

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < MINUTE) return t('time.justNow');
  if (seconds < HOUR) return t('time.minutesAgo', { count: Math.floor(seconds / MINUTE) });
  if (seconds < DAY) return t('time.hoursAgo', { count: Math.floor(seconds / HOUR) });
  return t('time.daysAgo', { count: Math.floor(seconds / DAY) });
}

/** The calendar day ("2026-10-27") of `ms` in `timeZone`. */
function dayIn(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

/**
 * The time of day on the city's clock, 24-hour, in the UI language ("07:12"),
 * whatever time zone the browser is in. A time from another day than `now`
 * (on that clock) gets its date too ("25. Okt., 05:12"), so it can't be read
 * as today. Pass `i18n.language` as `lang` and the city config's `timezone`.
 */
export function formatClockTime(isoString: string, lang: string, timeZone: string, now: number = Date.now()): string {
  if (!isoString) return '';
  const ms = new Date(isoString).getTime();
  if (isNaN(ms)) return '';

  const clock = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone } as const;
  if (dayIn(ms, timeZone) === dayIn(now, timeZone)) return new Date(ms).toLocaleTimeString(lang, clock);
  return new Date(ms).toLocaleString(lang, { day: 'numeric', month: 'short', ...clock });
}
