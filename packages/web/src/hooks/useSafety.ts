import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type SafetyReport, type ApiResponse } from '../lib/api.js';

/** `enabled` false for a city without a police feed. */
export function useSafety(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<SafetyReport[]>>({
    queryKey: ['safety', cityId],
    queryFn: () => api.getSafety(cityId),
    enabled,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
