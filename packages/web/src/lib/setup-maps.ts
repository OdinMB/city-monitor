import type { WebCityConfig } from '@city-monitor/shared';
import { defaultMapState } from '../hooks/useCommandCenter.js';
import type {
  DataLayer, EmergencySubLayer, HeatReliefSubLayer, MapState, NewsSubLayer, TrafficSubLayer, WaterSubLayer,
} from '../hooks/useCommandCenter.js';
import { cityLayers } from './map-layers.js';
import { PRESET_IDS, SUPPORT_TILE, cityTiles, isPreset, presetSections, type PresetId } from './tile-setups.js';
import { setupMapDiff, type SetupId, type SetupView } from './setup-state.js';

/**
 * The map of each setup: a preset's own map in a city, and a setup's map as
 * the visitor left it, their change (setup-state.ts) laid over the map it
 * starts from. Which presets a city's menu offers.
 */

export type SetupCity = Pick<WebCityConfig, 'id' | 'features'>;

const set = <T>(...values: T[]) => new Set<T>(values);

/**
 * What each preset changes in the city's default map (defaultMapState), its
 * main layer first (single view keeps the first layer's category). Everyday
 * is the default map itself. A sub-layer the city lacks falls back as the map
 * draws it (effectiveSubLayers, effectiveChoice in map-layers.ts).
 */
const PRESET_MAPS: Record<PresetId, () => Partial<MapState>> = {
  everyday: () => ({}),
  commute: () => ({
    activeLayers: set<DataLayer>('traffic', 'bike-sharing', 'parking', 'lifts', 'weather'),
    trafficSubLayers: set<TrafficSubLayer>('public-transport', 'incidents', 'roadworks', 'congestion'),
  }),
  dayOut: () => ({
    activeLayers: set<DataLayer>('weather', 'heat-relief', 'water', 'bike-sharing'),
    heatReliefSubLayers: set<HeatReliefSubLayer>('cool', 'fountains', 'toilets'),
    waterSubLayers: set<WaterSubLayer>('bathing', 'temperature'),
  }),
  health: () => ({
    activeLayers: set<DataLayer>('air-quality', 'emergencies'),
    emergencySubLayers: set<EmergencySubLayer>('pharmacies', 'hospitals', 'aeds'),
  }),
  storm: () => ({
    activeLayers: set<DataLayer>('warnings', 'weather', 'water', 'emergencies'),
    waterSubLayers: set<WaterSubLayer>('levels'),
    emergencySubLayers: set<EmergencySubLayer>('hospitals', 'pharmacies'),
  }),
  cityHall: () => ({
    activeLayers: set<DataLayer>('political', 'reports'),
    politicalLayer: 'elections',
  }),
  movingHere: () => ({
    activeLayers: set<DataLayer>('social', 'population', 'crime', 'noise'),
  }),
  visitors: () => ({
    activeLayers: set<DataLayer>('traffic', 'bike-sharing', 'heat-relief', 'emergencies'),
    trafficSubLayers: set<TrafficSubLayer>('public-transport'),
    heatReliefSubLayers: set<HeatReliefSubLayer>('fountains', 'toilets'),
    emergencySubLayers: set<EmergencySubLayer>('pharmacies', 'hospitals'),
  }),
  newsroom: () => ({
    activeLayers: set<DataLayer>('news', 'warnings', 'political', 'crime'),
    newsSubLayers: set<NewsSubLayer>('news', 'police'),
  }),
  cycling: () => ({
    activeLayers: set<DataLayer>('bike-sharing', 'traffic', 'accidents'),
    trafficSubLayers: set<TrafficSubLayer>('roadworks', 'incidents', 'bike-counts', 'telraam'),
    accidentFilter: 'bike',
  }),
  heatwave: () => ({
    activeLayers: set<DataLayer>('heat-relief', 'water', 'weather', 'trees'),
    heatReliefSubLayers: set<HeatReliefSubLayer>('cool', 'fountains', 'toilets'),
    waterSubLayers: set<WaterSubLayer>('bathing', 'temperature'),
  }),
};

/** A preset's map in a city: its layers the city has, all shown together. */
export function presetMap(preset: PresetId, city: SetupCity): MapState {
  const { layers } = cityLayers(city);
  const map: MapState = { ...defaultMapState(city.id), ...PRESET_MAPS[preset]() };
  return { ...map, singleView: false, activeLayers: new Set([...map.activeLayers].filter((l) => layers.has(l))) };
}

/** The map a setup starts from, which its change is measured against: a preset's own, Everyday's for the visitor's setups. */
export function setupBaseMap(id: SetupId, city: SetupCity): MapState {
  return presetMap(isPreset(id) ? id : 'everyday', city);
}

/** A setup's map as the visitor left it. */
export function setupMap(view: SetupView, id: SetupId, city: SetupCity): MapState {
  return { ...setupBaseMap(id, city), ...setupMapDiff(view, id) };
}

/**
 * The presets a city's menu offers, in menu order: those with a tile beyond
 * the support tile or a map layer in the city. Everyday always has one.
 */
export function offeredPresets(city: SetupCity): PresetId[] {
  const tiles = cityTiles(city.features);
  return PRESET_IDS.filter((preset) =>
    presetSections(preset, city.id, tiles).some((s) => s.tiles.some((t) => t !== SUPPORT_TILE))
    || presetMap(preset, city).activeLayers.size > 0);
}
