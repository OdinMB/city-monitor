/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type SafetyReport } from '../lib/api.js';

export function useSafety(cityId: string) {
  return useQuery<SafetyReport[]>({
    queryKey: ['safety', cityId],
    queryFn: () => api.getSafety(cityId),
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
}
