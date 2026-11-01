import type { CityConfig } from '@city-monitor/shared';

/**
 * Köln, wired only to the Germany-wide sources (DWD, Open-Meteo, NINA,
 * PEGELONLINE). City-specific sources (news feeds, police, transit, events,
 * council meetings, district boundaries) are not configured yet, so their
 * jobs fetch nothing for Köln.
 */
export const koeln: CityConfig = {
  id: 'koeln',
  // The German name: DWD UV is matched by it.
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
  feeds: [],
  dataSources: {
    // DWD warn cell 105315000, by its name: warnings for this region alone.
    weather: { provider: 'brightsky', lat: 50.9375, lon: 6.9603, dwdWarnRegion: 'Stadt Köln' },
    nina: { ars: '053150000000' }, // kreisfreie Stadt Köln, AGS 05315000
    aeds: { adminLevel: 6 },       // OSM boundary "Köln" of the kreisfreie Stadt
    pollen: {
      provider: 'dwd',
      regionId: 40,         // Nordrhein-Westfalen
      partregionId: 41,     // Rhein.-Westfäl. Tiefland
    },
    waterLevels: {
      provider: 'pegelonline',
      stations: [
        { uuid: 'a6ee8177-107b-47dd-bcfd-30960ccc6e9c', name: 'Köln', waterBody: 'Rhein' },
      ],
    },
  },
};
