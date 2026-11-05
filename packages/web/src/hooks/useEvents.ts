import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type CityEvent, type ApiResponse } from '../lib/api.js';

/** `enabled: false` asks nothing, for a page that needs the events only where a city may have some. */
export function useEvents(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<CityEvent[]>>({
    queryKey: ['events', cityId],
    queryFn: () => api.getEvents(cityId),
    enabled,
    refetchInterval: 30 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
