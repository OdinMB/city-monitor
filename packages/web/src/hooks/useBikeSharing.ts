import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type BikeSharingData } from '../lib/api.js';

/**
 * Bike-sharing stations, fetched only while the map layer is on (`enabled`):
 * Berlin's list is about 150 KB (30 KB gzipped), too much for the bootstrap. The server
 * refreshes the counts every 5 minutes.
 */
export function useBikeSharing(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<BikeSharingData | null>>({
    queryKey: ['bike-sharing', cityId],
    queryFn: () => api.getBikeSharing(cityId),
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
}
