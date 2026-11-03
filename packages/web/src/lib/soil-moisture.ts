/**
 * The drought tile's plain-language scale and trend, from soil moisture under
 * grass in % of usable field capacity (% nFK, .context/soil-moisture.md).
 * Agrometeorology reads < 30 % nFK as drought stress and 50–80 % as
 * well supplied; above 100 % the soil holds more than it can keep.
 */
import type { SoilMoistureDay } from './api.js';

export type SoilMoistureLevel = 'very-dry' | 'dry' | 'moderate' | 'moist' | 'wet';

/** Lower bounds in % nFK, driest last. */
const LEVELS: ReadonlyArray<[SoilMoistureLevel, number]> = [
  ['wet', 100],
  ['moist', 80],
  ['moderate', 50],
  ['dry', 30],
  ['very-dry', -Infinity],
];

export function soilMoistureLevel(pct: number): SoilMoistureLevel {
  return LEVELS.find(([, min]) => pct >= min)![0];
}

/** Text colour per level: browns for dry, green for well supplied, blues for wet. */
export const LEVEL_TEXT: Record<SoilMoistureLevel, string> = {
  'very-dry': 'text-red-600 dark:text-red-400',
  dry: 'text-amber-600 dark:text-amber-400',
  moderate: 'text-green-600 dark:text-green-400',
  moist: 'text-sky-600 dark:text-sky-400',
  wet: 'text-blue-600 dark:text-blue-400',
};

export const LEVEL_STROKE: Record<SoilMoistureLevel, string> = {
  'very-dry': '#dc2626',
  dry: '#d97706',
  moderate: '#16a34a',
  moist: '#0284c7',
  wet: '#2563eb',
};

const DAY_MS = 86_400_000;

/**
 * The change of the sandy-soil value (percentage points) from `days` days
 * before the newest day to it, or null when the history has no such day.
 */
export function changeOver(history: readonly SoilMoistureDay[], days: number): number | null {
  const last = history.at(-1);
  if (!last) return null;
  const target = new Date(Date.parse(`${last.date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
  const then = history.find((d) => d.date === target);
  return then ? Math.round(last.sandy - then.sandy) : null;
}
