/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export interface NewsSummaryData {
  briefing: string | null;
  generatedAt: string | null;
  headlineCount: number;
  cached: boolean;
}

export function useNewsSummary(cityId: string) {
  return useQuery<NewsSummaryData>({
    queryKey: ['news', 'summary', cityId],
    queryFn: () => api.getNewsSummary(cityId),
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
