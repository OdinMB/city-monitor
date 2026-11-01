import { createContext } from 'react';
import type { WebCityConfig } from '@city-monitor/shared';

export const CityContext = createContext<WebCityConfig | null>(null);
