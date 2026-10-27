import type { CityConfig } from '@city-monitor/shared';
import { berlin } from './cities/berlin.js';
import { hamburg } from './cities/hamburg.js';
import { koeln } from './cities/koeln.js';

/** Every configured city. Only the ones named in ACTIVE_CITIES are ingested and served. */
const ALL_CITIES: Record<string, CityConfig> = {
  berlin,
  hamburg,
  koeln,
};

function activeIds(): Set<string> {
  return new Set(
    (process.env.ACTIVE_CITIES || 'berlin')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function getActiveCities(): CityConfig[] {
  const ids = activeIds();
  return [...ids]
    .map((id) => ALL_CITIES[id])
    .filter((c): c is CityConfig => c !== undefined);
}

/** Returns a city config only if the city is active. */
export function getCityConfig(cityId: string): CityConfig | undefined {
  return activeIds().has(cityId) ? ALL_CITIES[cityId] : undefined;
}
