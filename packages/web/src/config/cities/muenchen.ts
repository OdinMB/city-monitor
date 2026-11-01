import type { WebCityConfig } from '@city-monitor/shared';

export const muenchen: WebCityConfig = {
  id: 'muenchen',
  name: 'München',
  country: 'DE',
  coordinates: { lat: 48.1374, lon: 11.5755 },
  boundingBox: { north: 48.248, south: 48.061, east: 11.723, west: 11.36 },
  timezone: 'Europe/Berlin',
  languages: ['de', 'en'],
  map: {
    center: [11.5755, 48.1374],
    zoom: 11,
    minZoom: 9,
    maxZoom: 17,
    bounds: [
      [11.32, 48.03],
      [11.76, 48.28],
    ],
  },
  theme: { accent: '#A16207' },
  // The Germany-wide sources without a river gauge, news feeds (no police
  // source), the city's roadworks, council meetings and the crisis-services
  // directory.
  features: ['news', 'nina', 'pollen', 'roadworks', 'councilMeetings', 'pharmacies', 'aeds', 'crisis'],
};
