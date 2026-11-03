import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type AirQualityStation, type ApiResponse } from '../lib/api.js';

/**
 * The city's official air quality stations (UBA, hourly). `enabled` false for
 * a city without them. The job runs twice an hour and UBA publishes each hour
 * one to two hours late, so a 15-minute poll keeps an open tab close enough.
 */
export function useAirQualityStations(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<AirQualityStation[] | null>>({
    queryKey: ['air-quality-stations', cityId],
    queryFn: () => api.getAirQualityStations(cityId),
    enabled,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: enabled ? query.data?.data ?? undefined : undefined, fetchedAt: query.data?.fetchedAt ?? null };
}
