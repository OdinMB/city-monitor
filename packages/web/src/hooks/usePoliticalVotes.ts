import { useQuery } from '@tanstack/react-query';
import { api, type PoliticalVote, type ApiResponse } from '../lib/api.js';

/**
 * The latest roll-call votes of the Bundestag and the state parliament, with
 * how the city's members voted. Weekly data: fetched once a day at most, and
 * not polled while empty (Berlin's new Abgeordnetenhaus has none yet).
 */
export function usePoliticalVotes(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<PoliticalVote[]>>({
    queryKey: ['political-votes', cityId],
    queryFn: () => api.getPoliticalVotes(cityId),
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 2,
  });
  return { ...query, data: query.data?.data };
}
