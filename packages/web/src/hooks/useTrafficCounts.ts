import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type TrafficCountData } from '../lib/api.js';

/**
 * Traffic counting sites, fetched only while a counts sub-layer of the traffic
 * layer is on (`enabled`): Hamburg's ~260 sites are about 50 KB. The counts are
 * hourly; the server looks for a new hour every 15 minutes.
 */
export function useTrafficCounts(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<TrafficCountData | null>>({
    queryKey: ['traffic-counts', cityId],
    queryFn: () => api.getTrafficCounts(cityId),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
}
