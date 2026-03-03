/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type LaborMarketSummary } from '../lib/api.js';

export function useLaborMarket(cityId: string, enabled = true) {
  return useQuery<LaborMarketSummary | null>({
    queryKey: ['labor-market', cityId],
    queryFn: () => api.getLaborMarket(cityId),
    enabled,
    refetchInterval: 60 * 60 * 1000,         // 1 hour
    refetchIntervalInBackground: false,
    staleTime: 30 * 60 * 1000,               // 30 min
    gcTime: 24 * 60 * 60 * 1000,             // 24 hours
    retry: 2,
    placeholderData: keepPreviousData,
  });
}
