import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type EvChargingData } from '../lib/api.js';

/**
 * Public charging stations, fetched only while the map layer is on (`enabled`):
 * Berlin's ~3,500 stations are about 600 KB (80 KB gzipped), too much for the
 * bootstrap. The register changes monthly; a city with a live status feed
 * (`live`, Hamburg) refetches every 5 minutes, as the server does.
 */
export function useEvCharging(cityId: string, enabled: boolean, live: boolean) {
  return useQuery<ApiResponse<EvChargingData | null>>({
    queryKey: ['ev-charging', cityId],
    queryFn: () => api.getEvCharging(cityId),
    enabled,
    staleTime: live ? 2 * 60 * 1000 : 6 * 60 * 60 * 1000,
    refetchInterval: live ? 5 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });
}
