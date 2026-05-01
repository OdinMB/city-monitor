import type { CityConfig } from '@city-monitor/shared';

export const hamburg: CityConfig = {
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
  feeds: [
    { name: 'NDR Hamburg', url: 'https://www.ndr.de/nachrichten/hamburg/index-rss.xml', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'Hamburger Abendblatt', url: 'https://www.abendblatt.de/hamburg/rss', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'MOPO', url: 'https://www.mopo.de/feed/', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'hamburg.de News', url: 'https://www.hamburg.de/rss/aktuelles/', tier: 1, type: 'gov', lang: 'de' },
  ],
  dataSources: {
    weather: { provider: 'brightsky', lat: 53.5511, lon: 9.9937 },
    // HVV transport.rest API is deprecated and offline (March 2026) — no free alternative
    police: {
      provider: 'rss',
      url: 'https://www.presseportal.de/rss/dienststelle_6013.rss2',
      districts: [
        // Bezirke (longer compound names before shorter substrings)
        'Hamburg-Mitte', 'Hamburg-Nord',
        'Altona-Altstadt', 'Altona-Nord', 'Altona',
        'Bergedorf', 'Eimsbüttel', 'Harburg', 'Wandsbek',

        // Altona Stadtteile
        'Ottensen', 'Bahrenfeld', 'Blankenese', 'Osdorf', 'Lurup',
        'Sülldorf', 'Rissen', 'Nienstedten', 'Groß Flottbek', 'Othmarschen',

        // Bergedorf Stadtteile
        'Lohbrügge', 'Allermöhe', 'Billwerder', 'Curslack', 'Kirchwerder',
        'Neuallermöhe',

        // Eimsbüttel Stadtteile
        'Eidelstedt', 'Stellingen', 'Lokstedt', 'Niendorf', 'Schnelsen',
        'Rotherbaum', 'Harvestehude', 'Hoheluft-West',

        // Harburg Stadtteile
        'Neugraben-Fischbek', 'Hausbruch', 'Heimfeld', 'Moorburg',
        'Neuland',

        // Hamburg-Mitte Stadtteile
        'St. Pauli', 'St. Georg', 'HafenCity', 'Hammerbrook', 'Borgfelde',
        'Hamm', 'Horn', 'Billstedt', 'Billbrook', 'Rothenburgsort',
        'Veddel', 'Wilhelmsburg', 'Neustadt', 'Finkenwerder',

        // Hamburg-Nord Stadtteile (longer names before shorter substrings)
        'Barmbek-Nord', 'Barmbek-Süd',
        'Winterhude', 'Eppendorf', 'Uhlenhorst', 'Hohenfelde', 'Dulsberg',
        'Alsterdorf', 'Ohlsdorf', 'Fuhlsbüttel', 'Langenhorn',
        'Groß Borstel', 'Hoheluft-Ost',

        // Wandsbek Stadtteile
        'Bramfeld', 'Rahlstedt', 'Farmsen-Berne', 'Tonndorf', 'Jenfeld',
        'Marienthal', 'Steilshoop', 'Wellingsbüttel', 'Sasel',
        'Poppenbüttel', 'Hummelsbüttel', 'Bergstedt', 'Duvenstedt',
        'Wohldorf-Ohlstedt', 'Volksdorf', 'Eilbek',
      ],
    },
    nina: { ars: '020000000000' },
    pollen: {
      provider: 'dwd',
      regionId: 10,         // Schleswig-Holstein und Hamburg
      partregionId: 12,     // Geest, Schleswig-Holstein und Hamburg
    },
    waterLevels: {
      provider: 'pegelonline',
      stations: [
        { uuid: 'd488c5cc-4de9-4631-8ce1-0db0e700b546', name: 'St. Pauli', waterBody: 'Elbe', tidal: true },
        { uuid: 'ae1b91d0-e746-4f65-9f64-2d2e23603a82', name: 'Bunthaus', waterBody: 'Elbe', tidal: true },
        { uuid: '816affba-0118-4668-887f-fb882ed573b2', name: 'Seemannshöft', waterBody: 'Elbe', tidal: true },
      ],
    },
  },
};
