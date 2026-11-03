import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse, type CitizenReportData } from '../lib/api.js';

/**
 * The city's citizen reports of the last two weeks (Open311), fetched only
 * while the reports layer is on: too large for bootstrap. `enabled` false for
 * a city without the source or with the layer off.
 */
export function useCitizenReports(cityId: string, enabled = true) {
  return useQuery<ApiResponse<CitizenReportData | null>>({
    queryKey: ['citizen-reports', cityId],
    queryFn: () => api.getCitizenReports(cityId),
    enabled,
    staleTime: 5 * 60 * 1000,         // 5 min
    refetchInterval: 15 * 60 * 1000,  // 15 min, as the job
    refetchIntervalInBackground: false,
  });
}
