import type { ReactNode } from 'react';
import { getCityConfig, getDefaultCityId } from '../config/index.js';
import { CityContext } from './CityContext.js';

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
