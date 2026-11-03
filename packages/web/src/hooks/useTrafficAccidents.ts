import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type TrafficAccidentData } from '../lib/api.js';

/**
 * Last year's injury accidents (Unfallatlas), fetched only while the map layer
 * is on (`enabled`): Berlin's ~13,000 are about 470 KB (130 KB gzipped). The
 * data changes once a year, so it is never refetched while the page is open.
 */
export function useTrafficAccidents(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<TrafficAccidentData | null>>({
    queryKey: ['traffic-accidents', cityId],
    queryFn: () => api.getTrafficAccidents(cityId),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}
