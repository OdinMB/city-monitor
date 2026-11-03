import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type SoilMoistureData, type ApiResponse } from '../lib/api.js';
import { FEED_TIMINGS } from '../lib/freshness.js';

/** Soil moisture at the city's DWD stations, and Berlin's Gieß den Kiez waterings, bootstrap-seeded. */
export function useSoilMoisture(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<SoilMoistureData | null>>({
    queryKey: ['soil-moisture', cityId],
    queryFn: () => api.getSoilMoisture(cityId),
    enabled,
    refetchInterval: FEED_TIMINGS.soilMoisture.refetch,
    refetchIntervalInBackground: false,
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
