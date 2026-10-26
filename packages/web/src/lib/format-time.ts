import type { TFunction } from 'i18next';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/**
 * Relative time ("5 min ago", "vor 5 Min.", "5 dk önce") in the UI language,
 * from the `time.*` translation keys. Future timestamps read as "just now".
 * The result already carries its "ago" word, so a sentence that embeds it
 * must not add one.
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
