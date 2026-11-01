import type { CityConfig } from '@city-monitor/shared';

/**
 * München, wired only to the Germany-wide sources (DWD, Open-Meteo, NINA,
 * OpenStreetMap, aponet.de). No PEGELONLINE gauge: the Isar through München
 * is a Bavarian water, not a federal waterway, so the city has no water
 * levels. Of the city-specific sources only roadworks are configured; news
 * feeds, police, transit, events, council meetings and district boundaries are
 * not yet, so their jobs fetch nothing for München.
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
    // DWD warns for city and Landkreis together, in one region (warnings.json cell
    // 109184000; dwd:Warngebiete_Kreise 909184999, checked 2026-11-01). The older
    // cap_warncellids_csv.csv still lists a "Stadt München" (109162000) DWD no longer uses.
    weather: { provider: 'brightsky', lat: 48.1374, lon: 11.5755, dwdWarnRegion: 'Kreis und Stadt München' },
    nina: { ars: '091620000000' }, // kreisfreie Stadt München, AGS 09162000
    aeds: { adminLevel: 6 },       // OSM boundary "München" of the kreisfreie Stadt
    pollen: {
      provider: 'dwd',
      regionId: 120,        // Bayern
      partregionId: 121,    // Allgäu/Oberbayern/Bay. Wald
    },
    // Roadworks and no-parking zones of the coming four weeks (dl-de/by-2.0); the job adds a
    // CQL filter for works on the carriageway (lib/roadworks-parsers.ts).
    roadworks: {
      provider: 'muenchen-wfs',
      url: 'https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=mor_wfs:baustellen_opendata&outputFormat=application/json&srsName=EPSG:4326',
    },
  },
};
