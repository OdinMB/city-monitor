import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type LiftOutageData, type ApiResponse } from '../lib/api.js';
import { FEED_TIMINGS } from '../lib/freshness.js';

/** The city's lifts and escalators out of service (KVB Köln, DB stations), bootstrap-seeded. */
export function useLiftOutages(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<LiftOutageData | null>>({
    queryKey: ['lift-outages', cityId],
    queryFn: () => api.getLiftOutages(cityId),
    enabled,
    refetchInterval: FEED_TIMINGS.liftOutages.refetch,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
