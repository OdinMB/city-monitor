/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { HistoryPoint } from '../lib/api.js';

/**
 * Fetch historical time-series data for a given domain.
 * Lazy — only fetches when `enabled` is true (e.g., tile is expanded).
 */
export function useWeatherHistory(cityId: string, enabled: boolean) {
  return useQuery<HistoryPoint[]>({
    queryKey: ['weather-history', cityId],
    queryFn: async () => (await api.getWeatherHistory(cityId, '7d')).data,
    enabled,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useAqiHistory(cityId: string, enabled: boolean) {
  return useQuery<HistoryPoint[]>({
    queryKey: ['aqi-history', cityId],
    queryFn: async () => (await api.getAqiHistory(cityId, '7d')).data,
    enabled,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useWaterLevelHistory(cityId: string, enabled: boolean) {
  return useQuery<HistoryPoint[]>({
    queryKey: ['water-level-history', cityId],
    queryFn: async () => (await api.getWaterLevelHistory(cityId, '7d')).data,
    enabled,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useLaborMarketHistory(cityId: string, enabled: boolean) {
  return useQuery<HistoryPoint[]>({
    queryKey: ['labor-market-history', cityId],
    queryFn: async () => (await api.getLaborMarketHistory(cityId, '365d')).data,
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
