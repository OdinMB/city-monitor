import { createContext } from 'react';
import type { CityConfig } from '@city-monitor/shared';

export const CityContext = createContext<CityConfig | null>(null);
