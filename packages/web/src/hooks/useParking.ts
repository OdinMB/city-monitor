import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type ParkingData } from '../lib/api.js';

/**
 * Car parks with live free spaces, fetched only while the parking map layer is
 * on (`enabled`). The server refreshes the counts every 5 minutes.
 */
export function useParking(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<ParkingData | null>>({
    queryKey: ['parking', cityId],
    queryFn: () => api.getParking(cityId),
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
}
