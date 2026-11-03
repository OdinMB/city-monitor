import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type CrimeAtlasData } from '../lib/api.js';

/**
 * Recorded crime per Bezirksregion (Kriminalitätsatlas), fetched only while the
 * crime map layer is on (`enabled`): Berlin's 143 areas with outlines are about
 * 200 KB. The atlas changes once a year, so it is never refetched while the
 * page is open.
 */
export function useCrimeAtlas(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<CrimeAtlasData | null>>({
    queryKey: ['crime-atlas', cityId],
    queryFn: () => api.getCrimeAtlas(cityId),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}
