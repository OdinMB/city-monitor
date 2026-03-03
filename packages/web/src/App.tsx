/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect } from 'react';
import { Routes, Route, useParams, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { CityProvider, useCityConfig } from './hooks/useCityConfig.js';
import { useTheme } from './hooks/useTheme.js';
import { useBootstrap } from './hooks/useBootstrap.js';
import { Shell } from './components/layout/Shell.js';
import { CommandLayout } from './components/layout/CommandLayout.js';
import { getCityConfig } from './config/index.js';
import { ImprintPage } from './pages/ImprintPage.js';
import { PrivacyPage } from './pages/PrivacyPage.js';
import { NoTrackingPage } from './pages/NoTrackingPage.js';
import { SourcesPage } from './pages/SourcesPage.js';

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
  const city = useCityConfig();
  useBootstrap(city.id);

  useEffect(() => {
    document.documentElement.setAttribute('data-city', city.id);
    document.title = `City Monitor — ${city.name}`;
  }, [city.id, city.name]);

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
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="*" element={<Navigate to={`/${cityId}`} replace />} />
      </Routes>
    </CityProvider>
  );
}

export function App() {
  const theme = useTheme((s) => s.theme);
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<Navigate to="/berlin" replace />} />
          <Route path="/imprint" element={<ImprintPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/no-ads-no-tracking" element={<NoTrackingPage />} />
          <Route path="/:cityId/*" element={<CityRoute />} />
        </Routes>
      </QueryClientProvider>
    </HelmetProvider>
  );
}
