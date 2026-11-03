import type { CityFeature, WebCityConfig } from '@city-monitor/shared';
import type {
  DataLayer, EmergencySubLayer, HeatReliefSubLayer, NewsSubLayer, NoiseLayer, NoiseWmsLayer, PoliticalLayer, SocialLayer, TrafficSubLayer, WaterSubLayer,
} from '../hooks/useCommandCenter.js';
import { METRIC_LAYER, socialAtlasOf } from './social-atlas.js';

/**
 * The map layers and sub-layers a city has data for, from its features. The
 * sidebar lists only these, and the map draws only these, whatever the shared
 * layer state holds (it outlives a switch to another city).
 */
export interface CityLayers {
  layers: ReadonlySet<DataLayer>;
  news: readonly NewsSubLayer[];
  emergencies: readonly EmergencySubLayer[];
  traffic: readonly TrafficSubLayer[];
  water: readonly WaterSubLayer[];
  /** Cool places, drinking fountains, public toilets: the lists the city has. */
  heatRelief: readonly HeatReliefSubLayer[];
  /** The noise maps (WMS). */
  noise: readonly NoiseLayer[];
  /** Live noise sensors. */
  noiseLive: boolean;
  social: readonly SocialLayer[];
  political: readonly PoliticalLayer[];
}

const SOCIAL_ATLAS_LAYERS: readonly SocialLayer[] = ['unemployment', 'single-parent', 'welfare', 'child-poverty'];

/** The keys whose condition holds, in the order given. */
function present<T>(entries: ReadonlyArray<readonly [T, boolean]>): T[] {
  return entries.filter(([, on]) => on).map(([key]) => key);
}

/**
 * The social-atlas sub-layers of a city: the indicators its source has
 * (lib/social-atlas.ts), or all four for a city given by its features alone.
 */
function socialAtlasLayers(id: string | undefined): readonly SocialLayer[] {
  const atlas = id === undefined ? undefined : socialAtlasOf(id);
  return atlas ? atlas.indicators.map((i) => METRIC_LAYER[i.metric]) : SOCIAL_ATLAS_LAYERS;
}

export function cityLayers({ id, features }: Pick<WebCityConfig, 'features'> & { id?: string }): CityLayers {
  const has = (feature: CityFeature) => features.includes(feature);

  const news = present<NewsSubLayer>([['news', has('news')], ['police', has('police')]]);
  const emergencies = present<EmergencySubLayer>([['pharmacies', has('pharmacies')], ['aeds', has('aeds')], ['hospitals', has('hospitals')]]);
  // TomTom traffic incidents cover every city.
  const traffic = present<TrafficSubLayer>([
    ['public-transport', has('transit')], ['incidents', true], ['congestion', has('trafficFlowMap')], ['roadworks', has('roadworks')],
    ['car-counts', has('carCounts')], ['bike-counts', has('bikeCounts')], ['telraam', has('telraamCounts')],
  ]);
  const water = present<WaterSubLayer>([['levels', has('waterLevels')], ['bathing', has('bathing')], ['temperature', has('waterTemperature')]]);
  const heatRelief = present<HeatReliefSubLayer>([
    ['cool', has('coolPlaces')], ['fountains', has('drinkingFountains')], ['toilets', has('publicToilets')],
  ]);
  const noise = present<NoiseLayer>([
    ['total', has('noiseTotal')], ['road', has('noiseMap')], ['rail', has('noiseMap')], ['air', has('noiseMap')],
  ]);
  const noiseLive = has('noiseSensors');
  const social = present<SocialLayer>([...socialAtlasLayers(id).map((key) => [key, has('socialAtlas')] as const), ['rent', has('rentMap')]]);
  // The representatives' views colour district outlines, which only some cities
  // ship, and each only where its members map onto Bezirke: district mayors,
  // Bundestag constituencies named after Bezirke (not Köln's "Köln I"), state
  // members grouped by Bezirk. The election view brings its own areas.
  const onDistricts = has('political') && has('politicalMap');
  const political = present<PoliticalLayer>([
    ['bezirke', onDistricts && has('districtMayors')], ['bundestag', onDistricts && has('bundestagByDistrict')],
    ['landesparlament', onDistricts && has('stateByDistrict')], ['elections', has('electionResults')],
  ]);

  const layers = new Set(present<DataLayer>([
    ['warnings', has('nina')],
    ['news', news.length > 0],
    ['traffic', true],
    ['bike-sharing', has('bikeSharing')],
    ['parking', has('parking')],
    ['accidents', has('trafficAccidents')],
    ['crime', has('crimeAtlas')],
    ['ev-charging', has('evCharging')],
    ['heat-relief', heatRelief.length > 0],
    ['weather', true],
    ['air-quality', true],
    ['noise', noise.length > 0 || noiseLive],
    ['water', water.length > 0],
    ['emergencies', emergencies.length > 0],
    ['social', social.length > 0],
    ['population', has('population')],
    ['political', political.length > 0],
    ['reports', has('citizenReports')],
    ['trees', has('streetTrees')],
  ]));

  return { layers, news, emergencies, traffic, water, heatRelief, noise, noiseLive, social, political };
}

/**
 * The layers without the hospitals sub-layer when the server holds no
 * hospital for the city (a source switched off, like the Klinik-Atlas without
 * KLINIK_ATLAS_ENABLED), and without the emergencies layer if that left it empty.
 */
export function withoutEmptyHospitals(layers: CityLayers, hasHospitals: boolean): CityLayers {
  if (hasHospitals || !layers.emergencies.includes('hospitals')) return layers;
  const emergencies = layers.emergencies.filter((s) => s !== 'hospitals');
  const kept = new Set(layers.layers);
  if (emergencies.length === 0) kept.delete('emergencies');
  return { ...layers, emergencies, layers: kept };
}

/** The selected sub-layers the city has, or every one it has when none of the selected ones is there. */
export function effectiveSubLayers<T>(selected: ReadonlySet<T>, available: readonly T[]): ReadonlySet<T> {
  const kept = available.filter((key) => selected.has(key));
  return new Set(kept.length > 0 ? kept : available);
}

/** The selection when the city has it, otherwise the first option it has. */
export function effectiveChoice<T>(selected: T, available: readonly T[]): T | undefined {
  return available.includes(selected) ? selected : available[0];
}

/**
 * The noise map to draw. No map (null) stays so only while live sensors are
 * there to show; otherwise the selection, or the city's first map.
 */
export function effectiveNoiseLayer(selected: NoiseWmsLayer, { noise, noiseLive }: CityLayers): NoiseWmsLayer {
  if (selected === null && noiseLive) return null;
  return (selected !== null && noise.includes(selected) ? selected : noise[0]) ?? null;
}
