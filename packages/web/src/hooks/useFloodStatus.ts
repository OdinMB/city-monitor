import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type FloodStatus, type ApiResponse } from '../lib/api.js';

/**
 * The city's LHP flood status. The LHP's terms ask that republished data be
 * refreshed at least every 10 minutes: the job runs every 5, the route may be
 * cached for 2 and this polls every 3, so an open tab is never further behind.
 */
export function useFloodStatus(cityId: string) {
  const query = useQuery<ApiResponse<FloodStatus | null>>({
    queryKey: ['flood-status', cityId],
    queryFn: () => api.getFloodStatus(cityId),
    refetchInterval: 3 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 2 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
