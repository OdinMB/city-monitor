import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type ConstructionSite, type ApiResponse } from '../lib/api.js';

/** `enabled` false for a city without a roadworks source. */
export function useConstruction(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<ConstructionSite[]>>({
    queryKey: ['construction', cityId],
    queryFn: () => api.getConstruction(cityId),
    enabled,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
