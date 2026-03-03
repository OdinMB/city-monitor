/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { create } from 'zustand';

export type DataLayer = 'transit' | 'weather' | 'news' | 'safety' | 'warnings' | 'air-quality' | 'emergencies' | 'traffic' | 'construction' | 'water-levels' | 'political';
export type PoliticalLayer = 'bezirke' | 'bundestag' | 'landesparlament';
export type EmergencySubLayer = 'pharmacies' | 'aeds';

interface CommandCenterState {
  singleView: boolean;
  activeLayers: Set<DataLayer>;
  politicalLayer: PoliticalLayer;
  emergencySubLayers: Set<EmergencySubLayer>;
  toggleSingleView: () => void;
  toggleLayer: (layer: DataLayer) => void;
  setPoliticalLayer: (layer: PoliticalLayer) => void;
  toggleEmergencySubLayer: (sub: EmergencySubLayer) => void;
}

const DEFAULT_LAYERS: Set<DataLayer> = new Set(['transit']);
const ALL_EMERGENCY_SUBS: Set<EmergencySubLayer> = new Set(['pharmacies', 'aeds']);

export const useCommandCenter = create<CommandCenterState>((set) => ({
  singleView: true,
  activeLayers: new Set(DEFAULT_LAYERS),
  politicalLayer: 'bundestag',
  emergencySubLayers: new Set(ALL_EMERGENCY_SUBS),
  toggleSingleView: () =>
    set((state) => {
      const singleView = !state.singleView;
      if (singleView && state.activeLayers.size > 1) {
        const first = state.activeLayers.values().next().value as DataLayer;
        return { singleView, activeLayers: new Set<DataLayer>([first]) };
      }
      return { singleView };
    }),
  toggleLayer: (layer) =>
    set((state) => {
      if (state.singleView) {
        // In single-view mode: toggle off if already active, otherwise switch to this layer only
        if (state.activeLayers.has(layer) && state.activeLayers.size === 1) {
          return { activeLayers: new Set<DataLayer>() };
        }
        return { activeLayers: new Set<DataLayer>([layer]) };
      }
      const next = new Set(state.activeLayers);
      if (next.has(layer)) {
        next.delete(layer);
      } else {
        next.add(layer);
      }
      return { activeLayers: next };
    }),
  setPoliticalLayer: (layer) => set({ politicalLayer: layer }),
  toggleEmergencySubLayer: (sub) =>
    set((state) => {
      const next = new Set(state.emergencySubLayers);
      if (next.has(sub)) {
        // Don't allow removing the last sub-layer
        if (next.size > 1) next.delete(sub);
      } else {
        next.add(sub);
      }
      return { emergencySubLayers: next };
    }),
}));
