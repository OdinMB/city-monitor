import type { CityConfig } from '@city-monitor/shared';

/**
 * München, wired only to the Germany-wide sources (DWD, Open-Meteo, NINA,
 * OpenStreetMap, aponet.de). No PEGELONLINE gauge: the Isar through München
 * is a Bavarian water, not a federal waterway, so the city has no water
 * levels. City-specific sources (news feeds, police, transit, events, council
 * meetings, district boundaries) are not configured yet, so their jobs fetch
 * nothing for München.
 */
export const muenchen: CityConfig = {
  id: 'muenchen',
  // The German name: DWD UV is matched by it.
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
  feeds: [],
  dataSources: {
    // DWD warn cell 109162000, by its name: not also the Landkreis ("Kreis München").
    weather: { provider: 'brightsky', lat: 48.1374, lon: 11.5755, dwdWarnRegion: 'Stadt München' },
    nina: { ars: '091620000000' }, // kreisfreie Stadt München, AGS 09162000
    aeds: { adminLevel: 6 },       // OSM boundary "München" of the kreisfreie Stadt
    pollen: {
      provider: 'dwd',
      regionId: 120,        // Bayern
      partregionId: 121,    // Allgäu/Oberbayern/Bay. Wald
    },
  },
};
