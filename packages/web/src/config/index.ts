import type { WebCityConfig } from '@city-monitor/shared';
import { berlin } from './cities/berlin.js';
import { hamburg } from './cities/hamburg.js';
import { koeln } from './cities/koeln.js';
import { muenchen } from './cities/muenchen.js';

const ALL_CITIES: Record<string, WebCityConfig> = {
  berlin,
  hamburg,
  koeln,
  muenchen,
};

/** Cities that are ready for users. Activating a city takes its ID here and
 *  in the server's ACTIVE_CITIES (set the server first). */
const ACTIVE_CITY_IDS = new Set(['berlin', 'hamburg', 'koeln', 'muenchen']);

export function getCityConfig(cityId: string): WebCityConfig | undefined {
  const config = ALL_CITIES[cityId];
  return config && ACTIVE_CITY_IDS.has(cityId) ? config : undefined;
}

export function getAllCities(): WebCityConfig[] {
  return Object.values(ALL_CITIES).filter((c) => ACTIVE_CITY_IDS.has(c.id));
}

/** Berlin while it is active, otherwise the first active city. With one active
 *  city `/` redirects here (with several it is the city picker), so this must
 *  never name an inactive city (that redirects back to `/`). */
export function getDefaultCityId(activeCities: WebCityConfig[] = getAllCities()): string {
  if (activeCities.some((c) => c.id === 'berlin')) return 'berlin';
  return activeCities[0]?.id ?? 'berlin';
}
