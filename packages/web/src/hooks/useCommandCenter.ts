import { create } from 'zustand';

export type DataLayer = 'weather' | 'news' | 'warnings' | 'air-quality' | 'noise' | 'emergencies' | 'traffic' | 'water' | 'social' | 'population' | 'political';
export type PoliticalLayer = 'bezirke' | 'bundestag' | 'landesparlament';
export type SocialLayer = 'unemployment' | 'single-parent' | 'welfare' | 'child-poverty' | 'rent';
export type PopulationLayer = 'pop-density' | 'pop-elderly' | 'pop-foreign';
export type NoiseLayer = 'total' | 'road' | 'rail' | 'air';
export type NewsSubLayer = 'news' | 'police';
export type EmergencySubLayer = 'pharmacies' | 'aeds';
export type WaterSubLayer = 'levels' | 'bathing';
export type TrafficSubLayer = 'public-transport' | 'incidents' | 'roadworks';

interface CommandCenterState {
  singleView: boolean;
  activeLayers: Set<DataLayer>;
  politicalLayer: PoliticalLayer;
  socialLayer: SocialLayer;
  populationLayer: PopulationLayer;
  noiseLayer: NoiseLayer;
  newsSubLayers: Set<NewsSubLayer>;
  emergencySubLayers: Set<EmergencySubLayer>;
  waterSubLayers: Set<WaterSubLayer>;
  trafficSubLayers: Set<TrafficSubLayer>;
  toggleSingleView: () => void;
  toggleLayer: (layer: DataLayer) => void;
  setPoliticalLayer: (layer: PoliticalLayer) => void;
  setSocialLayer: (layer: SocialLayer) => void;
  setPopulationLayer: (layer: PopulationLayer) => void;
  setNoiseLayer: (layer: NoiseLayer) => void;
  toggleNewsSubLayer: (sub: NewsSubLayer) => void;
  toggleEmergencySubLayer: (sub: EmergencySubLayer) => void;
  toggleWaterSubLayer: (sub: WaterSubLayer) => void;
  toggleTrafficSubLayer: (sub: TrafficSubLayer) => void;
  setActiveLayers: (layers: Set<DataLayer>) => void;
}

const DEFAULT_LAYERS: Set<DataLayer> = new Set(['traffic', 'weather', 'warnings']);
const ALL_NEWS_SUBS: Set<NewsSubLayer> = new Set(['news']);
const ALL_EMERGENCY_SUBS: Set<EmergencySubLayer> = new Set(['pharmacies']);
const ALL_WATER_SUBS: Set<WaterSubLayer> = new Set(['levels', 'bathing']);
const ALL_TRAFFIC_SUBS: Set<TrafficSubLayer> = new Set(['public-transport']);

export const useCommandCenter = create<CommandCenterState>((set) => ({
  singleView: false,
  activeLayers: new Set(DEFAULT_LAYERS),
  politicalLayer: 'bezirke',
  socialLayer: 'unemployment',
  populationLayer: 'pop-density',
  noiseLayer: 'total',
  newsSubLayers: new Set(ALL_NEWS_SUBS),
  emergencySubLayers: new Set(ALL_EMERGENCY_SUBS),
  waterSubLayers: new Set(ALL_WATER_SUBS),
  trafficSubLayers: new Set(ALL_TRAFFIC_SUBS),
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
  setSocialLayer: (layer) => set({ socialLayer: layer }),
  setPopulationLayer: (layer) => set({ populationLayer: layer }),
  setNoiseLayer: (layer) => set({ noiseLayer: layer }),
  toggleNewsSubLayer: (sub) =>
    set((state) => {
      const next = new Set(state.newsSubLayers);
      if (next.has(sub)) {
        if (next.size > 1) next.delete(sub);
      } else {
        next.add(sub);
      }
      return { newsSubLayers: next };
    }),
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
  toggleWaterSubLayer: (sub) =>
    set((state) => {
      const next = new Set(state.waterSubLayers);
      if (next.has(sub)) {
        if (next.size > 1) next.delete(sub);
      } else {
        next.add(sub);
      }
      return { waterSubLayers: next };
    }),
  toggleTrafficSubLayer: (sub) =>
    set((state) => {
      const next = new Set(state.trafficSubLayers);
      if (next.has(sub)) {
        if (next.size > 1) next.delete(sub);
      } else {
        next.add(sub);
      }
      return { trafficSubLayers: next };
    }),
  setActiveLayers: (layers) => set({ activeLayers: layers }),
}));
