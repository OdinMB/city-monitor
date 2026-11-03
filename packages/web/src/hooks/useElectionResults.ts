import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type ElectionResults } from '../lib/api.js';

/**
 * The latest election's result per area and city-wide (~30 KB for Berlin's 78
 * Wahlkreise), for the political tile's Election view and the map's popups.
 * A final result changes only with a correction, so it is never refetched
 * while the page is open. `enabled` false for a city without the source.
 */
export function useElectionResults(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<ElectionResults | null>>({
    queryKey: ['election-results', cityId],
    queryFn: () => api.getElectionResults(cityId),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}

/** The election areas' polygons with their strongest party (Berlin ~110 KB), fetched only while the map's Election view is on. */
export function useElectionGeojson(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<GeoJSON.FeatureCollection | null>>({
    queryKey: ['election-results', cityId, 'geojson'],
    queryFn: () => api.getElectionGeojson(cityId),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}
