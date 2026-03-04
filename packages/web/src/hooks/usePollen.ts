import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type PollenForecast, type ApiResponse } from '../lib/api.js';

export function usePollen(cityId: string) {
  const query = useQuery<ApiResponse<PollenForecast | null>>({
    queryKey: ['pollen', cityId],
    queryFn: () => api.getPollen(cityId),
    refetchInterval: 60 * 60 * 1000,            // 1 hour
    refetchIntervalInBackground: false,
    staleTime: 30 * 60 * 1000,                  // 30 min
    gcTime: 24 * 60 * 60 * 1000,               // 24 hours
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
