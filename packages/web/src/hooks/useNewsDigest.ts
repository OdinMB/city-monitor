import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type NewsDigest, type ApiResponse } from '../lib/api.js';

/** `enabled` false for a city without news feeds. */
export function useNewsDigest(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<NewsDigest>>({
    queryKey: ['news', 'digest', cityId],
    queryFn: () => api.getNewsDigest(cityId),
    enabled,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5 * 60 * 1000),
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
