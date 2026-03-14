import type { CityConfig } from '@city-monitor/shared';

export const berlin: CityConfig = {
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
      [12.9, 52.3],
      [13.8, 52.7],
    ],
  },
  theme: { accent: '#E2001A' },
  feeds: [],
  dataSources: {
    weather: { provider: 'open-meteo', lat: 52.52, lon: 13.405 },
  },
};
