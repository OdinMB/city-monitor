import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type NoiseSensor } from '../lib/api.js';

export function useNoiseSensors(cityId: string) {
  return useQuery<ApiResponse<NoiseSensor[] | null>>({
    queryKey: ['noise-sensors', cityId],
    queryFn: () => api.getNoiseSensors(cityId),
    staleTime: 5 * 60 * 1000,     // 5 min
    refetchInterval: 10 * 60 * 1000, // 10 min
  });
}
