/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type TransitAlert } from '../lib/api.js';

export function useTransit(cityId: string) {
  return useQuery<TransitAlert[]>({
    queryKey: ['transit', cityId],
    queryFn: () => api.getTransit(cityId),
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
}
