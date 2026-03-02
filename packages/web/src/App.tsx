/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect } from 'react';
import { Routes, Route, useParams, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CityProvider, useCityConfig } from './hooks/useCityConfig.js';
import { useTheme } from './hooks/useTheme.js';
import { useBootstrap } from './hooks/useBootstrap.js';
import { Shell } from './components/layout/Shell.js';
import { CommandLayout } from './components/layout/CommandLayout.js';
import { CityPicker } from './components/pages/CityPicker.js';
import { getCityConfig, getDefaultCityId } from './config/index.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});

function Dashboard() {
  const { id: cityId } = useCityConfig();
  useBootstrap(cityId);

  useEffect(() => {
    document.documentElement.setAttribute('data-city', cityId);
  }, [cityId]);

  return (
    <Shell>
      <CommandLayout />
    </Shell>
  );
}

function CityRoute() {
  const { cityId } = useParams<{ cityId: string }>();
  const config = cityId ? getCityConfig(cityId) : undefined;

  if (!config) {
    return <Navigate to="/" replace />;
  }

  return (
    <CityProvider cityId={cityId}>
      <Dashboard />
    </CityProvider>
  );
}

export function App() {
  const theme = useTheme((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<CityPicker />} />
        <Route path="/:cityId" element={<CityRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </QueryClientProvider>
  );
}
