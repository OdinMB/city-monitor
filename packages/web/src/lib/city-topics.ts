import type { CityFeature } from '@city-monitor/shared';

/**
 * Each feature's topic as the city picker names it (a translation key), or
 * null for a feature that only refines another topic's view. In the order the
 * picker names a city's topics first. A Record, so a new CityFeature does not
 * compile until it is placed here.
 */
const FEATURE_TOPIC: Record<CityFeature, string | null> = {
  news: 'panel.news.title',
  transit: 'panel.transit.title',
  police: 'sidebar.news.police',
  events: 'panel.events.title',
  waterLevels: 'panel.waterLevels.title',
  floodStatus: 'panel.floodStatus.title',
  appointments: 'panel.appointments.title',
  bathing: 'panel.bathing.title',
  liftOutages: 'panel.liftOutages.title',
  pollen: 'panel.pollen.title',
  nina: 'sidebar.layers.warnings',
  wastewater: 'panel.wastewater.title',
  electricity: 'panel.electricity.title',
  soilMoisture: 'panel.soilMoisture.title',
  councilMeetings: 'panel.councilMeetings.title',
  budget: 'panel.budget.title',
  laborMarket: 'panel.laborMarket.title',
  population: 'panel.population.title',
  feuerwehr: 'panel.feuerwehr.title',
  crisis: 'panel.crisis.title',
  political: 'sidebar.layers.political',
  socialAtlas: 'sidebar.layers.social',
  noiseMap: 'sidebar.layers.noise',
  bikeSharing: 'sidebar.layers.bike-sharing',
  parking: 'sidebar.layers.parking',
  citizenReports: 'sidebar.layers.reports',
  trafficAccidents: 'sidebar.layers.accidents',
  streetTrees: 'sidebar.layers.trees',
  evCharging: 'sidebar.layers.ev-charging',
  // Every city with a heat-relief layer has fountains; cool places and toilets
  // are its other sub-layers, so the layer counts once.
  drinkingFountains: 'sidebar.layers.heat-relief',
  // Refinements: live charging status is part of the charging layer;
  // road works, street counts and noise sensors are layers of traffic and noise,
  // pharmacies and defibrillators of the emergencies layer, the rent map a
  // social layer, official air stations part of air quality (every city's topic),
  // cool places and toilets heat-relief sub-layers, the rest parts of the
  // political tile. Tree watering is a section of the soil-moisture tile.
  airQualityStations: null,
  coolPlaces: null,
  publicToilets: null,
  treeWatering: null,
  respiratoryCases: null, // shown in the wastewater tile
  // A sub-layer of the water layer, whose topic is the water levels
  waterTemperature: null,
  roadworks: null,
  // The congestion map and the counters refine the traffic layer every city has
  trafficFlowMap: null,
  carCounts: null,
  bikeCounts: null,
  evChargingLive: null,
  telraamCounts: null,
  pharmacies: null,
  aeds: null,
  noiseSensors: null,
  noiseTotal: null,
  rentMap: null,
  districtMayors: null,
  mayor: null,
  stateByDistrict: null,
  politicalMap: null,
  bundestagByDistrict: null,
  electionResults: null,
};

/** Topics every city's dashboard has, whatever its features. */
const EVERY_CITY = ['panel.weather.title', 'panel.airQuality.title'];

export interface CityTopics {
  /** How many topics the city's dashboard covers. */
  count: number;
  /** The first few, as translation keys: the city's own, else the ones every city has. */
  highlights: string[];
}

/** What a city covers, for its tile on the city picker. */
export function cityTopics(features: readonly CityFeature[], highlights = 3): CityTopics {
  const own = (Object.entries(FEATURE_TOPIC) as [CityFeature, string | null][])
    .flatMap(([feature, topic]) => (topic !== null && features.includes(feature) ? [topic] : []));
  const topics = [...own, ...EVERY_CITY];
  return { count: topics.length, highlights: topics.slice(0, highlights) };
}
