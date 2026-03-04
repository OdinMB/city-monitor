import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type ApiResponse } from '../lib/api.js';
import type { CouncilMeeting } from '@city-monitor/shared';

export function useCouncilMeetings(cityId: string) {
  const query = useQuery<ApiResponse<CouncilMeeting[] | null>>({
    queryKey: ['council-meetings', cityId],
    queryFn: () => api.getCouncilMeetings(cityId),
    refetchInterval: 60 * 60 * 1000,            // 1 hour
    refetchIntervalInBackground: false,
    staleTime: 30 * 60 * 1000,                  // 30 min
    gcTime: 24 * 60 * 60 * 1000,               // 24 hours
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
