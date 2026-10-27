import type { CityConfig } from '@city-monitor/shared';
import { berlin } from './cities/berlin.js';
import { hamburg } from './cities/hamburg.js';
import { koeln } from './cities/koeln.js';

const ALL_CITIES: Record<string, CityConfig> = {
  berlin,
  hamburg,
  koeln,
};

/** Cities that are ready for users. Hamburg and Köln are kept in ALL_CITIES
 *  but excluded from the active set until their data sources are complete.
 *  Activating a city takes its ID here and in the server's ACTIVE_CITIES. */
const ACTIVE_CITY_IDS = new Set(['berlin']);

export function getCityConfig(cityId: string): CityConfig | undefined {
  const config = ALL_CITIES[cityId];
  return config && ACTIVE_CITY_IDS.has(cityId) ? config : undefined;
}

export function getAllCities(): CityConfig[] {
  return Object.values(ALL_CITIES).filter((c) => ACTIVE_CITY_IDS.has(c.id));
}

/** Berlin while it is active, otherwise the first active city. `/` redirects
 *  here, so this must never name an inactive city (that redirects back to `/`). */
export function getDefaultCityId(activeCities: CityConfig[] = getAllCities()): string {
  if (activeCities.some((c) => c.id === 'berlin')) return 'berlin';
  return activeCities[0]?.id ?? 'berlin';
}
