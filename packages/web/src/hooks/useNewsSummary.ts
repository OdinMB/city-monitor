/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery } from '@tanstack/react-query';
import { api, type NewsSummaryData, type ApiResponse } from '../lib/api.js';

export type { NewsSummaryData };

export function useNewsSummary(cityId: string) {
  const query = useQuery<ApiResponse<NewsSummaryData>>({
    queryKey: ['news', 'summary', cityId],
    queryFn: () => api.getNewsSummary(cityId),
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
