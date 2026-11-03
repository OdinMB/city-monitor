import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type HeatReliefData } from '../lib/api.js';

/**
 * Cool places, drinking fountains and public toilets, fetched only while the
 * heat-relief map layer is on (`enabled`): Berlin's ~900 places are about
 * 165 KB, too much for the bootstrap. The lists change weekly at most.
 */
export function useHeatRelief(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<HeatReliefData | null>>({
    queryKey: ['heat-relief', cityId],
    queryFn: () => api.getHeatRelief(cityId),
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: false,
  });
}
