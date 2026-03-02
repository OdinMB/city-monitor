/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type CityEvent } from '../lib/api.js';

export function useEvents(cityId: string) {
  return useQuery<CityEvent[]>({
    queryKey: ['events', cityId],
    queryFn: () => api.getEvents(cityId),
    refetchInterval: 60 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
}
