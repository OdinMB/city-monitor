/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type WeatherData, type ApiResponse } from '../lib/api.js';

export function useWeather(cityId: string) {
  const query = useQuery<ApiResponse<WeatherData>>({
    queryKey: ['weather', cityId],
    queryFn: () => api.getWeather(cityId),
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  return { ...query, data: query.data?.data, fetchedAt: query.data?.fetchedAt ?? null };
}
