import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type NoiseSensor } from '../lib/api.js';

/** `enabled` false for a city without live noise sensors. */
export function useNoiseSensors(cityId: string, enabled = true) {
  return useQuery<ApiResponse<NoiseSensor[] | null>>({
    queryKey: ['noise-sensors', cityId],
    queryFn: () => api.getNoiseSensors(cityId),
    enabled,
    staleTime: 5 * 60 * 1000,     // 5 min
    refetchInterval: 10 * 60 * 1000, // 10 min
  });
}
