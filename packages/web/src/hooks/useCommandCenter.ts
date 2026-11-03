import { create } from 'zustand';
import type { CitizenReportStatus, CrimeIndicator } from '../lib/api.js';

/** A map layer the map draws. The sidebar groups them into categories (MapCategory). */
export type DataLayer = 'weather' | 'news' | 'warnings' | 'air-quality' | 'noise' | 'emergencies' | 'traffic' | 'bike-sharing' | 'parking' | 'ev-charging' | 'heat-relief' | 'accidents' | 'lifts' | 'crime' | 'water' | 'social' | 'population' | 'political' | 'reports' | 'trees';

/**
 * The sidebar's top-level entries. Most are one layer; traffic, environment
 * and social group several, listed inside them once the category is on.
 */
export type MapCategory = 'warnings' | 'news' | 'traffic' | 'weather' | 'environment' | 'emergencies' | 'social' | 'reports';

/** Each category's layers, in the order the sidebar lists them. */
export const CATEGORY_LAYERS: Record<MapCategory, readonly DataLayer[]> = {
  warnings: ['warnings'],
  news: ['news'],
  traffic: ['traffic', 'lifts', 'accidents', 'parking', 'ev-charging', 'bike-sharing'],
  weather: ['weather'],
  environment: ['air-quality', 'noise', 'water', 'heat-relief', 'trees'],
  emergencies: ['emergencies'],
  social: ['social', 'population', 'crime', 'political'],
  reports: ['reports'],
};

/** The categories in sidebar order; the first nine have number keys 1-9. */
export const CATEGORY_ORDER: readonly MapCategory[] = ['warnings', 'news', 'traffic', 'weather', 'environment', 'emergencies', 'social', 'reports'];

/** The categories that group several layers. */
export const GROUP_CATEGORIES: ReadonlySet<MapCategory> = new Set(['traffic', 'environment', 'social']);

export function categoryOf(layer: DataLayer): MapCategory {
  return CATEGORY_ORDER.find((c) => CATEGORY_LAYERS[c].includes(layer))!;
}
/** Which accidents the accident layer shows: all, or those with a bicycle or a pedestrian involved. */
export type AccidentFilter = 'all' | 'bike' | 'pedestrian';
/** The offence group the crime map colours its areas by. */
export type CrimeLayer = CrimeIndicator;
/** The political map's views: who represents each area, or how it voted in the latest election (`elections`). */
export type PoliticalLayer = 'bezirke' | 'bundestag' | 'landesparlament' | 'elections';
export type SocialLayer = 'unemployment' | 'single-parent' | 'welfare' | 'child-poverty' | 'rent';
export type PopulationLayer = 'pop-density' | 'pop-elderly' | 'pop-foreign';
export type NoiseLayer = 'total' | 'road' | 'rail' | 'air';
export type NoiseWmsLayer = NoiseLayer | null;
export type NewsSubLayer = 'news' | 'police';
export type EmergencySubLayer = 'pharmacies' | 'aeds' | 'hospitals';
export type WaterSubLayer = 'levels' | 'bathing' | 'temperature';
/** `telraam`: yesterday's citizen street counts (Berlin), off until chosen (not in DEFAULT_TRAFFIC_SUBS). */
export type TrafficSubLayer = 'public-transport' | 'incidents' | 'congestion' | 'roadworks' | 'car-counts' | 'bike-counts' | 'telraam';
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
  crimeLayer: CrimeLayer;
  heatReliefSubLayers: Set<HeatReliefSubLayer>;
  /** The citizen reports drawn, by status: open and in progress unless closed ones are asked for too. */
  reportStatuses: Set<CitizenReportStatus>;
  toggleSingleView: () => void;
  /** Switches a layer inside its category; in single view, layers of another category go. */
  toggleLayer: (layer: DataLayer) => void;
  /**
   * Switches a category: off when any of its layers is on, otherwise on with
   * `layers` (the category's defaults the city has). In single view it
   * replaces what is shown.
   */
  toggleCategory: (category: MapCategory, layers: readonly DataLayer[]) => void;
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
  setCrimeLayer: (layer: CrimeLayer) => void;
  toggleHeatReliefSubLayer: (sub: HeatReliefSubLayer) => void;
  /** Adds or removes a status from the citizen reports drawn; the last one stays. */
  toggleReportStatus: (status: CitizenReportStatus) => void;
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
const ALL_WATER_SUBS: Set<WaterSubLayer> = new Set(['levels', 'bathing', 'temperature']);
/**
 * The traffic sub-layers shown when the layer is switched on. The congestion
 * map and the counting sites are opt-in: they would crowd the incidents, and
 * the counts are fetched only once asked for.
 */
const DEFAULT_TRAFFIC_SUBS: Set<TrafficSubLayer> = new Set(['public-transport', 'incidents', 'roadworks']);
const ALL_HEAT_RELIEF_SUBS: Set<HeatReliefSubLayer> = new Set(['cool', 'fountains', 'toilets']);
/** Closed reports are opt-in: what is still broken is what the layer is for. */
const DEFAULT_REPORT_STATUSES: Set<CitizenReportStatus> = new Set(['open', 'in_progress']);

/** The layers of `layers` in the same category as `layer`. */
function sameCategory(layers: Iterable<DataLayer>, layer: DataLayer): DataLayer[] {
  const members = CATEGORY_LAYERS[categoryOf(layer)];
  return [...layers].filter((l) => members.includes(l));
}

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
  crimeLayer: 'total',
  heatReliefSubLayers: new Set(ALL_HEAT_RELIEF_SUBS),
  reportStatuses: new Set(DEFAULT_REPORT_STATUSES),
  toggleSingleView: () =>
    set((state) => {
      const singleView = !state.singleView;
      if (singleView && state.activeLayers.size > 1) {
        // Single view shows one category: the first one shown keeps its layers.
        const first = state.activeLayers.values().next().value as DataLayer;
        return { singleView, activeLayers: new Set<DataLayer>(sameCategory(state.activeLayers, first)) };
      }
      return { singleView };
    }),
  toggleLayer: (layer) =>
    set((state) => {
      const base = state.singleView ? sameCategory(state.activeLayers, layer) : [...state.activeLayers];
      const next = new Set<DataLayer>(base);
      if (state.activeLayers.has(layer)) {
        next.delete(layer);
        return { activeLayers: next };
      }
      next.add(layer);
      // Back to the default sub-layers when turning traffic back on
      if (layer === 'traffic') return { activeLayers: next, trafficSubLayers: new Set(DEFAULT_TRAFFIC_SUBS) };
      return { activeLayers: next };
    }),
  toggleCategory: (category, layers) =>
    set((state) => {
      const members = CATEGORY_LAYERS[category];
      const isOn = [...state.activeLayers].some((l) => members.includes(l));
      if (isOn) {
        return { activeLayers: new Set([...state.activeLayers].filter((l) => !members.includes(l))) };
      }
      const next = new Set<DataLayer>(state.singleView ? layers : [...state.activeLayers, ...layers]);
      if (layers.includes('traffic')) return { activeLayers: next, trafficSubLayers: new Set(DEFAULT_TRAFFIC_SUBS) };
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
      // The traffic sub-layers sit beside the category's other layers, so
      // choosing one while traffic itself is off shows that one alone, and
      // switching off the last one switches traffic off.
      if (!state.activeLayers.has('traffic')) {
        const base = state.singleView ? sameCategory(state.activeLayers, 'traffic') : [...state.activeLayers];
        return { activeLayers: new Set<DataLayer>([...base, 'traffic']), trafficSubLayers: new Set([sub]) };
      }
      const next = new Set(state.trafficSubLayers);
      if (next.has(sub)) {
        if (next.size === 1) {
          const activeLayers = new Set(state.activeLayers);
          activeLayers.delete('traffic');
          return { activeLayers };
        }
        next.delete(sub);
      } else {
        next.add(sub);
      }
      return { trafficSubLayers: next };
    }),
  setAccidentFilter: (filter) => set({ accidentFilter: filter }),
  setCrimeLayer: (layer) => set({ crimeLayer: layer }),
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
  toggleReportStatus: (status) =>
    set((state) => {
      const next = new Set(state.reportStatuses);
      if (next.has(status)) {
        if (next.size > 1) next.delete(status);
      } else {
        next.add(status);
      }
      return { reportStatuses: next };
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
        return { layersCityId: cityId, activeLayers: new Set<DataLayer>(sameCategory(layers, first)), waterSubLayers };
      }
      return { layersCityId: cityId, activeLayers: layers, waterSubLayers };
    }),
}));
