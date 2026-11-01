import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type AedLocation, type ApiResponse } from '../lib/api.js';

/** `enabled` false for a city without defibrillator data. */
export function useAeds(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<AedLocation[]>>({
    queryKey: ['aeds', cityId],
    queryFn: () => api.getAeds(cityId),
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
