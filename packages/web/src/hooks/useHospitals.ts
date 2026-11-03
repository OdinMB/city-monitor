import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { WebCityConfig } from '@city-monitor/shared';
import { api, type ApiResponse, type HospitalData } from '../lib/api.js';
import { cityLayers, withoutEmptyHospitals, type CityLayers } from '../lib/map-layers.js';

/** The city's hospitals (weekly job). `enabled` false for a city without the source. */
export function useHospitals(cityId: string, enabled = true) {
  const query = useQuery<ApiResponse<HospitalData | null>>({
    queryKey: ['hospitals', cityId],
    queryFn: () => api.getHospitals(cityId),
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

/**
 * The city's map layers (`cityLayers`), less the hospitals sub-layer while the
 * server has no hospital for the city: Berlin, Köln and München have only the
 * Klinik-Atlas, which the server leaves out with KLINIK_ATLAS=false.
 */
export function useCityLayers(city: Pick<WebCityConfig, 'id' | 'features'>): CityLayers {
  const base = useMemo(() => cityLayers(city), [city]);
  const { data } = useHospitals(city.id, base.emergencies.includes('hospitals'));
  const hasHospitals = (data?.hospitals.length ?? 0) > 0;
  return useMemo(() => withoutEmptyHospitals(base, hasHospitals), [base, hasHospitals]);
}
