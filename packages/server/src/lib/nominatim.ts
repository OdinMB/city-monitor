/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createLogger } from './logger.js';

const log = createLogger('nominatim');

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const TIMEOUT_MS = 5_000;

/** Minimum delay between requests to respect Nominatim usage policy (1 req/sec). */
let lastRequestTime = 0;

export interface NominatimResult {
  lat: number;
  lon: number;
  displayName: string;
}

/**
 * Geocode a location string via OpenStreetMap Nominatim.
 * Returns the top result or null if not found.
 * Respects the 1 request/second rate limit.
 */
export async function geocode(
  location: string,
  cityName: string,
): Promise<NominatimResult | null> {
  const query = `${location}, ${cityName}`;

  // Enforce 1 req/sec rate limit
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastRequestTime = Date.now();

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'de',
  });

  try {
    const response = await log.fetch(`${NOMINATIM_BASE}/search?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'CityMonitor/1.0 (https://github.com/OdinMB/city-monitor)',
      },
    });

    if (!response.ok) {
      log.warn(`Nominatim returned ${response.status} for "${query}"`);
      return null;
    }

    const results = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;

    if (results.length === 0) return null;

    return {
      lat: parseFloat(results[0].lat),
      lon: parseFloat(results[0].lon),
      displayName: results[0].display_name,
    };
  } catch (err) {
    log.warn(`Nominatim failed for "${query}"`);
    return null;
  }
}
