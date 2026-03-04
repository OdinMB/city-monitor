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
    if (data.nina) queryClient.setQueryData(['nina', cityId], data.nina);
    if (data.airQuality) queryClient.setQueryData(['air-quality', cityId], data.airQuality);
    if (data.pharmacies) queryClient.setQueryData(['pharmacies', cityId], data.pharmacies);
    if (data.aeds) queryClient.setQueryData(['aeds', cityId], data.aeds);
    if (data.traffic) queryClient.setQueryData(['traffic', cityId], data.traffic);
    if (data.construction) queryClient.setQueryData(['construction', cityId], data.construction);
    if (data.waterLevels) queryClient.setQueryData(['water-levels', cityId], data.waterLevels);
    if (data.budget) queryClient.setQueryData(['budget', cityId], data.budget);
    if (data.appointments) queryClient.setQueryData(['appointments', cityId], data.appointments);
    if (data.laborMarket) queryClient.setQueryData(['labor-market', cityId], data.laborMarket);
    if (data.wastewater) queryClient.setQueryData(['wastewater', cityId], data.wastewater);
    if (data.populationSummary) queryClient.setQueryData(['population-summary', cityId], data.populationSummary);
    if (data.feuerwehr) queryClient.setQueryData(['feuerwehr', cityId], data.feuerwehr);
    if (data.pollen) queryClient.setQueryData(['pollen', cityId], data.pollen);
  }, [query.data, cityId, queryClient]);

  // Note: bootstrap fields are already in { data, fetchedAt } format matching
  // individual hook query shapes, so setQueryData works without wrapping.

  return query;
}
