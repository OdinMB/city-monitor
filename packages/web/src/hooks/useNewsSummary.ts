import { useQuery } from '@tanstack/react-query';
import { api, type NewsSummaryData, type ApiResponse } from '../lib/api.js';

export type { NewsSummaryData };

export function useNewsSummary(cityId: string, lang?: string) {
  const query = useQuery<ApiResponse<NewsSummaryData>>({
    queryKey: ['news', 'summary', cityId, lang],
    queryFn: () => api.getNewsSummary(cityId, lang),
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
