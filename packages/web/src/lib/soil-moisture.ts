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

/**
 * The tile's scale: one equal segment per level, driest first, each with its
 * range in % nFK (the wet one ends at 120 %, beyond which the marker stays at
 * the end).
 */
export const SCALE: ReadonlyArray<{ level: SoilMoistureLevel; from: number; to: number }> = [
  { level: 'very-dry', from: 0, to: 30 },
  { level: 'dry', from: 30, to: 50 },
  { level: 'moderate', from: 50, to: 80 },
  { level: 'moist', from: 80, to: 100 },
  { level: 'wet', from: 100, to: 120 },
];

/** Where a value sits on the scale, 0–100 % of its length. */
export function scalePosition(pct: number): number {
  const last = SCALE.length - 1;
  const i = SCALE.findIndex((s) => pct < s.to);
  if (i < 0) return 100;
  const { from, to } = SCALE[i]!;
  const within = Math.max(0, Math.min(1, (pct - from) / (to - from)));
  return ((i + within) / (last + 1)) * 100;
}

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
