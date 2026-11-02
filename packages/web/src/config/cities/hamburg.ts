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
  // Transit from HVV's Geofox GTI, which the server fetches only with its
  // credentials set (otherwise the tile says there is no transit data). No
  // events, appointments, budget, noise sensors, district mayors or Berlin's
  // own sources. Council meetings are the
  // Bürgerschaft's only; no Bezirksversammlung source. Bathing water from the
  // city's WFS, the rent map from its Wohnlagenverzeichnis WMS. The social
  // atlas is the Sozialmonitoring (857 Statistische Gebiete), population the
  // Stadtteil statistics (99 Stadtteile). The Bürgerschaft's constituencies are
  // not Bezirke, so its members are not grouped by Bezirk; its Bundestag
  // constituencies are named after them, so the political map has a Bundestag view.
  features: ['news', 'police', 'nina', 'pollen', 'waterLevels', 'transit', 'roadworks', 'bathing', 'socialAtlas', 'population', 'councilMeetings', 'laborMarket', 'wastewater', 'pharmacies', 'aeds', 'political', 'noiseMap', 'rentMap', 'crisis', 'politicalMap', 'bundestagByDistrict'],
};
