import { useCityConfig } from './useCityConfig.js';
import { useEvents } from './useEvents.js';

/**
 * Whether the events tile shows: always in a city with public events, which
 * says when there are none; in a city whose only events come from Hamburg
 * Tourismus ('hhtEvents') only while the API returns some. Until HHT
 * approves, they reach only requests with the preview token
 * (lib/preview-token.ts), so the public page has no empty tile. Sections use
 * it too, so one left with nothing on screen is not shown.
 */
export function useEventsTileShown(): boolean {
  const { id: cityId, features } = useCityConfig();
  const hasEvents = features.includes('events') || features.includes('hhtEvents');
  const { data } = useEvents(cityId, hasEvents);
  if (!hasEvents) return false;
  return features.includes('events') || Boolean(data && data.length > 0);
}
