/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { CityConfig } from '@city-monitor/shared';
import { getCityConfig, getDefaultCityId } from '../config/index.js';

const CityContext = createContext<CityConfig | null>(null);

export function CityProvider({ cityId, children }: { cityId?: string; children: ReactNode }) {
  const config = getCityConfig(cityId || getDefaultCityId());
  if (!config) {
    return <div>Unknown city: {cityId}</div>;
  }
  return (
    <CityContext.Provider value={config}>
      {children}
    </CityContext.Provider>
  );
}

export function useCityConfig(): CityConfig {
  const config = useContext(CityContext);
  if (!config) {
    throw new Error('useCityConfig must be used within a CityProvider');
  }
  return config;
}
