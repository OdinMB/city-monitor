/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { create } from 'zustand';

export type TimeRange = '1h' | '6h' | '24h' | '48h' | '7d' | 'all';
export type DataLayer = 'transit' | 'events' | 'weather' | 'news' | 'safety' | 'warnings' | 'air-quality' | 'pharmacies' | 'traffic';
export type MapMode = 'default' | 'political';
export type PoliticalLayer = 'bezirke' | 'bundestag' | 'landesparlament';

interface CommandCenterState {
  timeRange: TimeRange;
  activeLayers: Set<DataLayer>;
  weatherExpanded: boolean;
  mapMode: MapMode;
  politicalLayer: PoliticalLayer;
  setTimeRange: (range: TimeRange) => void;
  toggleLayer: (layer: DataLayer) => void;
  setWeatherExpanded: (expanded: boolean) => void;
  setMapMode: (mode: MapMode) => void;
  setPoliticalLayer: (layer: PoliticalLayer) => void;
}

const DEFAULT_LAYERS: Set<DataLayer> = new Set(['transit', 'events']);

export const useCommandCenter = create<CommandCenterState>((set) => ({
  timeRange: '7d',
  activeLayers: new Set(DEFAULT_LAYERS),
  weatherExpanded: false,
  mapMode: 'default',
  politicalLayer: 'bezirke',
  setTimeRange: (range) => set({ timeRange: range }),
  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.activeLayers);
      if (next.has(layer)) {
        next.delete(layer);
      } else {
        next.add(layer);
      }
      return { activeLayers: next };
    }),
  setWeatherExpanded: (expanded) => set({ weatherExpanded: expanded }),
  setMapMode: (mode) => set({ mapMode: mode }),
  setPoliticalLayer: (layer) => set({ politicalLayer: layer }),
}));
