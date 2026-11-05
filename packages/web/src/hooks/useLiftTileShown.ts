import { useCityConfig } from './useCityConfig.js';
import { useLiftOutages } from './useLiftOutages.js';

/**
 * Whether the lift outages tile shows: always with KVB's lists (Köln), which
 * say when there is no data; with DB stations alone only once the server has
 * data, which takes its DB API key, so the tile does not say "no data" for
 * months. Sections use it too, so one left with nothing on screen is not shown.
 */
export function useLiftTileShown(): boolean {
  const { id: cityId, features } = useCityConfig();
  const hasLifts = features.includes('liftOutages') || features.includes('stationLifts');
  const { data, isLoading, isError } = useLiftOutages(cityId, hasLifts);
  if (!hasLifts) return false;
  return features.includes('liftOutages') || isError || (!isLoading && Boolean(data));
}
