import type { TFunction } from 'i18next';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/** English-only relative time (for standalone display where i18n isn't needed). */
export function formatRelativeTime(isoString: string): string {
  if (!isoString) return '';

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return 'just now';

  if (seconds < MINUTE) return 'just now';
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)} min ago`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
  return `${Math.floor(seconds / DAY)}d ago`;
}

/** i18n-aware relative time using the time.* translation keys. */
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
