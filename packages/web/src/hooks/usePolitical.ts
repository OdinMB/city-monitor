import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type PoliticalDistrict, type PoliticalLevel, type ApiResponse } from '../lib/api.js';

/** `enabled` false for a level the city has no data for: it would poll an empty answer every 30 s. */
export function usePolitical(cityId: string, level: PoliticalLevel, enabled = true) {
  const query = useQuery<ApiResponse<PoliticalDistrict[]>>({
    queryKey: ['political', cityId, level],
    queryFn: () => api.getPolitical(cityId, level),
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
    // Refetch every 30s while the server hasn't populated the cache yet
    refetchInterval: (query) => {
      const resp = query.state.data;
      return !resp || !resp.data || resp.data.length === 0 ? 30_000 : false;
    },
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
