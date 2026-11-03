import type { WebCityConfig } from '@city-monitor/shared';

export const berlin: WebCityConfig = {
  id: 'berlin',
  name: 'Berlin',
  country: 'DE',
  coordinates: { lat: 52.52, lon: 13.405 },
  boundingBox: { north: 52.68, south: 52.34, east: 13.76, west: 13.09 },
  timezone: 'Europe/Berlin',
  languages: ['de', 'en', 'tr', 'ar'],
  map: {
    center: [13.405, 52.52],
    zoom: 12,
    minZoom: 9,
    maxZoom: 17,
    bounds: [
      [13.00, 52.3],
      [13.80, 52.7],
    ],
  },
  theme: { accent: '#E2001A' },
  // Every feature there is but `mayor`, which only a city inside a state has:
  // Berlin is the city with every source.
  features: [
    'news', 'police', 'nina', 'pollen', 'waterLevels', 'transit', 'events', 'appointments',
    'budget', 'roadworks', 'socialAtlas', 'laborMarket', 'wastewater', 'noiseSensors', 'councilMeetings', 'pharmacies', 'aeds', 'hospitals',
    'political', 'districtMayors', 'stateByDistrict',
    'bathing', 'population', 'feuerwehr', 'airQualityStations', 'bikeSharing', 'stationLifts', 'trafficAccidents', 'electricity',
    'evCharging', 'coolPlaces', 'drinkingFountains', 'publicToilets', 'soilMoisture', 'treeWatering',
    'crisis', 'rentMap', 'noiseMap', 'noiseTotal', 'politicalMap', 'bundestagByDistrict', 'streetTrees',
  ],
};
