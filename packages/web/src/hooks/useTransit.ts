import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type TransitAlert, type ApiResponse } from '../lib/api.js';

/** `enabled` false for a city without a transit source. */
export function useTransit(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<TransitAlert[]>>({
    queryKey: ['transit', cityId],
    queryFn: () => api.getTransit(cityId),
    enabled,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
