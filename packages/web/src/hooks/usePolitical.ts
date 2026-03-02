/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type PoliticalDistrict } from '../lib/api.js';

export function usePolitical(cityId: string, level: 'bundestag' | 'state') {
  return useQuery<PoliticalDistrict[]>({
    queryKey: ['political', cityId, level],
    queryFn: () => api.getPolitical(cityId, level),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
}
