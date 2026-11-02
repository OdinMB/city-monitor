import type { WebCityConfig } from '@city-monitor/shared';

export const hamburg: WebCityConfig = {
  id: 'hamburg',
  name: 'Hamburg',
  country: 'DE',
  coordinates: { lat: 53.5511, lon: 9.9937 },
  boundingBox: { north: 53.74, south: 53.39, east: 10.33, west: 9.73 },
  timezone: 'Europe/Berlin',
  languages: ['de', 'en'],
  map: {
    center: [9.9937, 53.5511],
    zoom: 11,
    minZoom: 9,
    maxZoom: 17,
    bounds: [
      [9.7, 53.35],
      [10.35, 53.75],
    ],
  },
  theme: { accent: '#004B93' },
  // No transit (HVV has no free API), events, appointments, budget,
  // social atlas, noise sensors, council meetings, district mayors or Berlin's
  // own sources. The Bürgerschaft's constituencies are not Bezirke, so its
  // members are not grouped by Bezirk; its Bundestag constituencies are named
  // after them, so the political map has a Bundestag view.
  features: ['news', 'police', 'nina', 'pollen', 'waterLevels', 'roadworks', 'laborMarket', 'wastewater', 'pharmacies', 'aeds', 'political', 'noiseMap', 'crisis', 'politicalMap', 'bundestagByDistrict'],
};
