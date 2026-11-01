import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type EmergencyPharmacy, type ApiResponse } from '../lib/api.js';

/** `enabled` false for a city without emergency pharmacies. */
export function usePharmacies(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<EmergencyPharmacy[]>>({
    queryKey: ['pharmacies', cityId],
    queryFn: () => api.getPharmacies(cityId),
    enabled,
    refetchInterval: 6 * 60 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 3 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
