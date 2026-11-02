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
  // The Germany-wide sources, news feeds, Polizei Köln, the city's roadworks,
  // events and council meetings, the members of the Bundestag and Landtag for
  // its constituencies, its Oberbürgermeister and Bezirksbürgermeister, and the
  // crisis-services directory. Its nine Stadtbezirke ship as outlines, so the
  // political map layer has the Bezirksbürgermeister view alone: its
  // constituencies ("Köln I") are not Stadtbezirke.
  features: ['news', 'police', 'nina', 'pollen', 'waterLevels', 'events', 'roadworks', 'councilMeetings', 'pharmacies', 'aeds', 'political', 'districtMayors', 'mayor', 'crisis', 'politicalMap'],
};
