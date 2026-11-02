import { useBathing } from './useBathing.js';

/**
 * True when no loaded bathing spot is in season. Berlin's spots share one
 * season; Hamburg's each have their own, so one open spot keeps the tile in season.
 */
export function useBathingOffSeason(cityId: string): boolean {
  const { data } = useBathing(cityId);
  return data != null && data.length > 0 && data.every((s) => !s.inSeason);
}
