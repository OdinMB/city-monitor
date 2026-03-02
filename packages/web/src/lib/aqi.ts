/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export interface AqiLevel {
  label: string;
  color: string;
  bg: string;
}

const AQI_LEVELS: Array<{ max: number } & AqiLevel> = [
  { max: 20, label: 'good', color: '#50C878', bg: 'bg-green-100 dark:bg-green-900/30' },
  { max: 40, label: 'fair', color: '#FFD700', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  { max: 60, label: 'moderate', color: '#FF8C00', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  { max: 80, label: 'poor', color: '#FF4444', bg: 'bg-red-100 dark:bg-red-900/30' },
  { max: 100, label: 'veryPoor', color: '#8B008B', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  { max: Infinity, label: 'extremelyPoor', color: '#800000', bg: 'bg-red-200 dark:bg-red-900/50' },
];

export function getAqiLevel(aqi: number): AqiLevel {
  for (const level of AQI_LEVELS) {
    if (aqi <= level.max) return level;
  }
  return AQI_LEVELS[AQI_LEVELS.length - 1];
}
