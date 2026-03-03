/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, type BootstrapData } from '../lib/api.js';

export function useBootstrap(cityId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<BootstrapData>({
    queryKey: ['bootstrap', cityId],
    queryFn: () => api.getBootstrap(cityId),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!query.data) return;

    const data = query.data;
    if (data.news) queryClient.setQueryData(['news', 'digest', cityId], data.news);
    if (data.weather) queryClient.setQueryData(['weather', cityId], data.weather);
    if (data.transit) queryClient.setQueryData(['transit', cityId], data.transit);
    if (data.events) queryClient.setQueryData(['events', cityId], data.events);
    if (data.safety) queryClient.setQueryData(['safety', cityId], data.safety);
    if (data.construction) queryClient.setQueryData(['construction', cityId], data.construction);
    if (data.waterLevels) queryClient.setQueryData(['water-levels', cityId], data.waterLevels);
    if (data.budget) queryClient.setQueryData(['budget', cityId], data.budget);
    if (data.appointments) queryClient.setQueryData(['appointments', cityId], data.appointments);
    if (data.laborMarket) queryClient.setQueryData(['labor-market', cityId], data.laborMarket);
    if (data.wastewater) queryClient.setQueryData(['wastewater', cityId], data.wastewater);
  }, [query.data, cityId, queryClient]);

  return query;
}
