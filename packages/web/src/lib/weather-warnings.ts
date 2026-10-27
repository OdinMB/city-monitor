import type { TFunction } from 'i18next';
import { cityDate, formatCityClock } from './city-time.js';

/**
 * Official weather warnings (DWD) as the weather tile, its header chip and
 * popover show them: which are still in force, the warning level of a
 * `WeatherAlert.severity` and when the warning ends, on the city's clock and
 * in the UI language.
 */

/** The levels the server sends, plus `unknown` for any other severity. */
export type WarningLevel = 'moderate' | 'severe' | 'extreme' | 'unknown';

const RANK: Record<WarningLevel, number> = { unknown: 0, moderate: 1, severe: 2, extreme: 3 };

/** The warning level of an alert's `severity`; `unknown` when it is not one the server sends. */
export function warningLevel(severity: string): WarningLevel {
  return severity === 'moderate' || severity === 'severe' || severity === 'extreme' ? severity : 'unknown';
}

/** The most serious level among the warnings, or null when there are none. */
export function highestWarningLevel(alerts: readonly { severity: string }[]): WarningLevel | null {
  let highest: WarningLevel | null = null;
  for (const alert of alerts) {
    const level = warningLevel(alert.severity);
    if (highest === null || RANK[level] > RANK[highest]) highest = level;
  }
  return highest;
}

/**
 * How long past its end a warning still counts as in force, so a device clock
 * that runs a few minutes fast does not hide a live warning.
 */
export const WARNING_END_GRACE_MS = 5 * 60_000;

/** The instant a warning ends, or NaN when `validUntil` is empty (no end) or unreadable. */
function warningEnd(validUntil: string): number {
  return validUntil ? Date.parse(validUntil) : NaN;
}

/**
 * The warnings in force at `now` (ms): those without a readable end, and those
 * whose end plus `WARNING_END_GRACE_MS` is still ahead. The data can hold a
 * warning past its end until the next ingestion drops it.
 */
export function warningsInForce<T extends { validUntil: string }>(alerts: readonly T[], now: number): T[] {
  return alerts.filter((alert) => {
    const end = warningEnd(alert.validUntil);
    return Number.isNaN(end) || now < end + WARNING_END_GRACE_MS;
  });
}

/** When the first of these warnings stops counting (its end plus the grace), or null when none has an end. */
export function nextWarningExpiry(alerts: readonly { validUntil: string }[]): number | null {
  let next: number | null = null;
  for (const alert of alerts) {
    const end = warningEnd(alert.validUntil);
    if (Number.isNaN(end)) continue;
    const expiry = end + WARNING_END_GRACE_MS;
    if (next === null || expiry < next) next = expiry;
  }
  return next;
}

const DAY_MS = 86_400_000;

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

/**
 * When a warning ends, from its `validUntil` (ISO, or '' when DWD gives no end):
 * "Until 18:00" on the city's day, "Until tomorrow, 06:00" on the next one, and
 * the weekday and date beyond that, on the clocks of `timeZone` and with
 * `panel.weather.warning.*` words. An empty or unreadable end reads as
 * "Until further notice". Digits stay Latin in every language.
 */
export function formatWarningEnd(
  validUntil: string,
  now: Date | number,
  timeZone: string,
  lang: string,
  t: TFunction,
): string {
  const end = warningEnd(validUntil);
  if (Number.isNaN(end)) return t('panel.weather.warning.noEnd');

  const time = formatCityClock(end, timeZone);
  const endDate = cityDate(end, timeZone);
  const today = cityDate(now, timeZone);
  if (endDate === today) return t('panel.weather.warning.untilTime', { time });
  if (endDate === nextDate(today)) return t('panel.weather.warning.untilTomorrow', { time });

  const day = new Intl.DateTimeFormat(lang, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
    numberingSystem: 'latn',
  }).format(end);
  return t('panel.weather.warning.untilDay', { day, time });
}
