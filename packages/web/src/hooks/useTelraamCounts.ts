import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type TelraamCountsData } from '../lib/api.js';

/**
 * Yesterday's Telraam street counts (Berlin zählt Mobilität), fetched only
 * while their traffic sub-layer is on (`enabled`). The counts change once a
 * day, so an hour's staleness is plenty.
 */
export function useTelraamCounts(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<TelraamCountsData | null>>({
    queryKey: ['telraam-counts', cityId],
    queryFn: () => api.getTelraamCounts(cityId),
    enabled,
    staleTime: 60 * 60 * 1000,
    refetchInterval: enabled ? 60 * 60 * 1000 : false,
    gcTime: 30 * 60 * 1000,
  });
}
