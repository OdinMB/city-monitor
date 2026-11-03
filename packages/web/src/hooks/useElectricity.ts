import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type ElectricityData, type ApiResponse } from '../lib/api.js';
import { FEED_TIMINGS } from '../lib/freshness.js';

/** The control area's generation mix and Germany's grid signal and CO₂ (SMARD, Energy-Charts), bootstrap-seeded. */
export function useElectricity(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<ElectricityData | null>>({
    queryKey: ['electricity', cityId],
    queryFn: () => api.getElectricity(cityId),
    enabled,
    refetchInterval: FEED_TIMINGS.electricity.refetch,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
