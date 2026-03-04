import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type FeuerwehrSummary, type ApiResponse } from '../lib/api.js';

export function useFeuerwehr(cityId: string) {
  const query = useQuery<ApiResponse<FeuerwehrSummary | null>>({
    queryKey: ['feuerwehr', cityId],
    queryFn: () => api.getFeuerwehr(cityId),
    refetchInterval: 24 * 60 * 60 * 1000,     // 24 hours
    refetchIntervalInBackground: false,
    staleTime: 12 * 60 * 60 * 1000,           // 12 hours
    gcTime: 24 * 60 * 60 * 1000,              // 24 hours
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
