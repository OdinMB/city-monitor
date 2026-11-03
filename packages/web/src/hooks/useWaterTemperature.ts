import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type WaterTemperatureData } from '../lib/api.js';

/**
 * Water temperature at the city's measuring points, fetched only while the
 * water layer's temperature sub-layer is on (`enabled`). The server reads the
 * stations every 15 minutes.
 */
export function useWaterTemperature(cityId: string, enabled: boolean) {
  return useQuery<ApiResponse<WaterTemperatureData | null>>({
    queryKey: ['water-temperature', cityId],
    queryFn: () => api.getWaterTemperature(cityId),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
}
