/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type ConstructionSite, type ApiResponse } from '../lib/api.js';

export function useConstruction(cityId: string) {
  const query = useQuery<ApiResponse<ConstructionSite[]>>({
    queryKey: ['construction', cityId],
    queryFn: () => api.getConstruction(cityId),
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
