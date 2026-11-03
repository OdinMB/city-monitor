import { create } from 'zustand';

export type DataLayer = 'weather' | 'news' | 'warnings' | 'air-quality' | 'noise' | 'emergencies' | 'traffic' | 'bike-sharing' | 'ev-charging' | 'heat-relief' | 'accidents' | 'water' | 'social' | 'population' | 'political' | 'reports' | 'trees';
/** Which accidents the accident layer shows: all, or those with a bicycle or a pedestrian involved. */
export type AccidentFilter = 'all' | 'bike' | 'pedestrian';
export type PoliticalLayer = 'bezirke' | 'bundestag' | 'landesparlament';
export type SocialLayer = 'unemployment' | 'single-parent' | 'welfare' | 'child-poverty' | 'rent';
export type PopulationLayer = 'pop-density' | 'pop-elderly' | 'pop-foreign';
export type NoiseLayer = 'total' | 'road' | 'rail' | 'air';
export type NoiseWmsLayer = NoiseLayer | null;
export type NewsSubLayer = 'news' | 'police';
export type EmergencySubLayer = 'pharmacies' | 'aeds';
export type WaterSubLayer = 'levels' | 'bathing';
export type TrafficSubLayer = 'public-transport' | 'incidents' | 'congestion' | 'roadworks' | 'car-counts' | 'bike-counts';
export type HeatReliefSubLayer = 'cool' | 'fountains' | 'toilets';

interface CommandCenterState {
  singleView: boolean;
  activeLayers: Set<DataLayer>;
  politicalLayer: PoliticalLayer;
  socialLayer: SocialLayer;
  populationLayer: PopulationLayer;
  noiseLayer: NoiseWmsLayer;
  noiseLiveData: boolean;
  newsSubLayers: Set<NewsSubLayer>;
  emergencySubLayers: Set<EmergencySubLayer>;
  waterSubLayers: Set<WaterSubLayer>;
  trafficSubLayers: Set<TrafficSubLayer>;
  accidentFilter: AccidentFilter;
  heatReliefSubLayers: Set<HeatReliefSubLayer>;
  toggleSingleView: () => void;
  toggleLayer: (layer: DataLayer) => void;
  setPoliticalLayer: (layer: PoliticalLayer) => void;
  setSocialLayer: (layer: SocialLayer) => void;
  setPopulationLayer: (layer: PopulationLayer) => void;
  setNoiseLayer: (layer: NoiseLayer) => void;
  toggleNoiseLiveData: () => void;
  toggleNewsSubLayer: (sub: NewsSubLayer) => void;
  toggleEmergencySubLayer: (sub: EmergencySubLayer) => void;
  toggleWaterSubLayer: (sub: WaterSubLayer) => void;
  toggleTrafficSubLayer: (sub: TrafficSubLayer) => void;
  setAccidentFilter: (filter: AccidentFilter) => void;
  toggleHeatReliefSubLayer: (sub: HeatReliefSubLayer) => void;
  /** Turns the heat-relief layer on with all its sub-layers (the weather tile's heat hint); in single view it replaces the shown layer. */
  showHeatRelief: () => void;
  setActiveLayers: (layers: Set<DataLayer>) => void;
  /** The city whose dashboard the layer choice was last made for. */
  layersCityId: string | null;
  /**
   * Opens a city's dashboard: a different city than last time starts from that
   * city's default layers; the same city (back from its Sources page) keeps
   * the visitor's choice.
   */
  enterCity: (cityId: string) => void;
}

const DEFAULT_LAYERS: Set<DataLayer> = new Set(['traffic', 'weather', 'warnings']);
/** Layers a city's map shows on opening on top of DEFAULT_LAYERS. */
const CITY_EXTRA_DEFAULT_LAYERS: Partial<Record<string, readonly DataLayer[]>> = {
  hamburg: ['water'],
};

/** Water sub-layers a city's map opens with, where not all of them. */
const CITY_DEFAULT_WATER_SUBS: Partial<Record<string, readonly WaterSubLayer[]>> = {
  hamburg: ['levels'],
};

/** The layers a city's map opens with. */
export function defaultLayersFor(cityId: string): Set<DataLayer> {
  return new Set([...DEFAULT_LAYERS, ...(CITY_EXTRA_DEFAULT_LAYERS[cityId] ?? [])]);
}
const ALL_NEWS_SUBS: Set<NewsSubLayer> = new Set(['news']);
const ALL_EMERGENCY_SUBS: Set<EmergencySubLayer> = new Set(['pharmacies']);
const ALL_WATER_SUBS: Set<WaterSubLayer> = new Set(['levels', 'bathing']);
/**
 * The traffic sub-layers shown when the layer is switched on. The congestion
 * map and the counting sites are opt-in: they would crowd the incidents, and
 * the counts are fetched only once asked for.
 */
const DEFAULT_TRAFFIC_SUBS: Set<TrafficSubLayer> = new Set(['public-transport', 'incidents', 'roadworks']);
const ALL_HEAT_RELIEF_SUBS: Set<HeatReliefSubLayer> = new Set(['cool', 'fountains', 'toilets']);

export const useCommandCenter = create<CommandCenterState>((set) => ({
  singleView: false,
  activeLayers: new Set(DEFAULT_LAYERS),
  politicalLayer: 'bezirke',
  socialLayer: 'unemployment',
  populationLayer: 'pop-density',
  noiseLayer: 'total',
  noiseLiveData: true,
  newsSubLayers: new Set(ALL_NEWS_SUBS),
  emergencySubLayers: new Set(ALL_EMERGENCY_SUBS),
  waterSubLayers: new Set(ALL_WATER_SUBS),
  trafficSubLayers: new Set(DEFAULT_TRAFFIC_SUBS),
  accidentFilter: 'all',
  heatReliefSubLayers: new Set(ALL_HEAT_RELIEF_SUBS),
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
        if (state.activeLayers.has(layer) && state.activeLayers.size === 1) {
          return { activeLayers: new Set<DataLayer>() };
        }
        const extra: Partial<CommandCenterState> = {};
        if (layer === 'traffic') extra.trafficSubLayers = new Set(DEFAULT_TRAFFIC_SUBS);
        return { activeLayers: new Set<DataLayer>([layer]), ...extra };
      }
      const next = new Set(state.activeLayers);
      if (next.has(layer)) {
        next.delete(layer);
      } else {
        next.add(layer);
        // Back to the default sub-layers when turning the traffic category back on
        if (layer === 'traffic') return { activeLayers: next, trafficSubLayers: new Set(DEFAULT_TRAFFIC_SUBS) };
      }
      return { activeLayers: next };
    }),
  setPoliticalLayer: (layer) => set({ politicalLayer: layer }),
  setSocialLayer: (layer) => set({ socialLayer: layer }),
  setPopulationLayer: (layer) => set({ populationLayer: layer }),
  setNoiseLayer: (layer) => set((state) => ({ noiseLayer: state.noiseLayer === layer ? null : layer })),
  toggleNoiseLiveData: () => set((state) => ({ noiseLiveData: !state.noiseLiveData })),
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
  setAccidentFilter: (filter) => set({ accidentFilter: filter }),
  toggleHeatReliefSubLayer: (sub) =>
    set((state) => {
      const next = new Set(state.heatReliefSubLayers);
      if (next.has(sub)) {
        if (next.size > 1) next.delete(sub);
      } else {
        next.add(sub);
      }
      return { heatReliefSubLayers: next };
    }),
  showHeatRelief: () =>
    set((state) => {
      const activeLayers = state.singleView ? new Set<DataLayer>(['heat-relief']) : new Set([...state.activeLayers, 'heat-relief' as const]);
      return { activeLayers, heatReliefSubLayers: new Set(ALL_HEAT_RELIEF_SUBS) };
    }),
  setActiveLayers: (layers) => set({ activeLayers: layers }),
  layersCityId: null,
  enterCity: (cityId) =>
    set((state) => {
      if (state.layersCityId === cityId) return {};
      const layers = defaultLayersFor(cityId);
      const waterSubLayers = new Set<WaterSubLayer>(CITY_DEFAULT_WATER_SUBS[cityId] ?? ALL_WATER_SUBS);
      if (state.singleView) {
        const first = layers.values().next().value as DataLayer;
        return { layersCityId: cityId, activeLayers: new Set<DataLayer>([first]), waterSubLayers };
      }
      return { layersCityId: cityId, activeLayers: layers, waterSubLayers };
    }),
}));
