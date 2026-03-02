/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CityProvider, useCityConfig } from './hooks/useCityConfig.js';
import { useTheme } from './hooks/useTheme.js';
import { useBootstrap } from './hooks/useBootstrap.js';
import { Shell } from './components/layout/Shell.js';
import { PanelGrid } from './components/layout/PanelGrid.js';
import { NewsBriefingPanel } from './components/panels/NewsBriefingPanel.js';
import { WeatherPanel } from './components/panels/WeatherPanel.js';
import { TransitPanel } from './components/panels/TransitPanel.js';
import { EventsPanel } from './components/panels/EventsPanel.js';
import { SafetyPanel } from './components/panels/SafetyPanel.js';
import { MapPanel } from './components/panels/MapPanel.js';

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
      <PanelGrid>
        <NewsBriefingPanel />
        <WeatherPanel />
        <TransitPanel />
        <EventsPanel />
        <SafetyPanel />
        <MapPanel />
      </PanelGrid>
    </Shell>
  );
}

export function App() {
  const theme = useTheme((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <CityProvider>
        <Dashboard />
      </CityProvider>
    </QueryClientProvider>
  );
}
