// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2025 Odin Mühlenbein

/**
 * Map display settings — controls how many markers appear per layer.
 * Tune these to keep the map readable without overwhelming the user.
 */

export const MAP_NEWS = {
  /** Max news markers shown on the map total (before spatial bonus) */
  maxTotal: 25,
  /** Guaranteed slots per category (filled first, before importance ranking) */
  guaranteedPerCategory: 3,
  /** Max items without a location (they all cluster at city center) */
  maxWithoutLocation: 5,
  /** Max extra markers added to fill empty map areas */
  spatialBonusMax: 15,
  /** Grid cell size in degrees (~1 km at Berlin's latitude) */
  spatialGridSize: 0.01,
  /** Minimum importance for spatial bonus items (Phase 3, filling empty areas) */
  minImportanceSpatial: 0.3,
} as const;

/** Safety marker recency thresholds — at city-wide zoom show only
 *  very recent reports; at close zoom show the full 7-day window. */
export const MAP_SAFETY = {
  /** Hours of recency at city-wide zoom (< zoomThreshold) */
  recentHours: 24,
  /** Zoom level below which we restrict to recentHours */
  zoomThreshold: 12,
} as const;

/** Dense point layers get a minimum zoom so they don't clutter the city view. */
export const MAP_DENSITY = {
  /** Min zoom for pharmacy markers */
  pharmacyMinZoom: 12,
  /** Min zoom for AED markers */
  aedMinZoom: 13,
} as const;
