import type { WebCityConfig } from '@city-monitor/shared';

export const koeln: WebCityConfig = {
  id: 'koeln',
  name: 'Köln',
  country: 'DE',
  coordinates: { lat: 50.9375, lon: 6.9603 },
  boundingBox: { north: 51.09, south: 50.83, east: 7.17, west: 6.77 },
  timezone: 'Europe/Berlin',
  languages: ['de', 'en'],
  map: {
    center: [6.9603, 50.9375],
    zoom: 11,
    minZoom: 9,
    maxZoom: 17,
    bounds: [
      [6.73, 50.8],
      [7.21, 51.12],
    ],
  },
  theme: { accent: '#C8102E' },
  // The Germany-wide sources only, and the crisis-services directory.
  features: ['nina', 'pollen', 'waterLevels', 'pharmacies', 'aeds', 'crisis'],
};
