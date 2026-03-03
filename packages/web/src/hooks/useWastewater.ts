/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type WastewaterSummary, type ApiResponse } from '../lib/api.js';

export function useWastewater(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<WastewaterSummary | null>>({
    queryKey: ['wastewater', cityId],
    queryFn: () => api.getWastewater(cityId),
    enabled,
    refetchInterval: 24 * 60 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
