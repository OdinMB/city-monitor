import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type RespiratoryCases, type ApiResponse } from '../lib/api.js';

/** RKI-notified flu and RSV cases for the wastewater tile; weekly data, fetched daily. */
export function useRespiratoryCases(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<RespiratoryCases | null>>({
    queryKey: ['respiratory-cases', cityId],
    queryFn: () => api.getRespiratoryCases(cityId),
    enabled,
    refetchInterval: 24 * 60 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
