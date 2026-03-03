/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { SafetyReport } from './api.js';
import { MAP_SAFETY } from './map-settings.js';

/**
 * Filter safety reports by recency based on the current zoom level.
 * At city-wide zoom (below threshold), only show recent reports.
 * At close zoom, show all reports.
 */
export function filterSafetyByRecency(
  reports: SafetyReport[],
  zoom: number,
  now: number = Date.now(),
): SafetyReport[] {
  if (zoom >= MAP_SAFETY.zoomThreshold) return reports;

  const cutoff = now - MAP_SAFETY.recentHours * 60 * 60 * 1000;
  return reports.filter((r) => {
    const t = new Date(r.publishedAt).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });
}
