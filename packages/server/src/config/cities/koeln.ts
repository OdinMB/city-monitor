import type { CityConfig } from '@city-monitor/shared';

/**
 * Köln, wired to the Germany-wide sources (DWD, Open-Meteo, NINA, PEGELONLINE)
 * plus the city's own events and its council information system. Other
 * city-specific sources (news feeds, police, transit, district boundaries)
 * are not configured yet, so their jobs fetch nothing for Köln.
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
    // The city's own events (Stadt Köln open data, dl-de/zero-2.0)
    events: [
      { source: 'stadt-koeln', url: 'https://www.stadt-koeln.de/externe-dienste/open-data/events-od.php' },
    ],
    // SessionNet OParl 1.1: council, committees and the nine Bezirksvertretungen in one body.
    // Official public records; the API states no licence.
    councilMeetings: {
      oparlBody: {
        meetingsUrl: 'https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/meetings',
        districtBody: 'Bezirksvertretung',
        webUrlPrefix: 'https://buergerinfo.stadt-koeln.de/si0057.asp?__ksinr=',
      },
    },
  },
};
