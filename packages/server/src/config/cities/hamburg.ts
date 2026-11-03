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
    // Licence verdicts and why Abendblatt and hamburg.de are gone: .context/news.md, "Feed status".
    // NDR's old index-rss.xml redirects to an RSS 1.0 (RDF) feed, which the parser can't read.
    { name: 'NDR Hamburg', url: 'https://www.ndr.de/nachrichten/hamburg/index~rss2.xml', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'MOPO', url: 'https://www.mopo.de/feed/', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'Feuerwehr Hamburg', url: 'https://www.presseportal.de/rss/dienststelle_82522.rss2', tier: 2, type: 'gov', lang: 'de' },
  ],
  dataSources: {
    weather: { provider: 'brightsky', lat: 53.5511, lon: 9.9937 },
    // HVV's Geofox GTI announcements; runs only with GEOFOX_USER and GEOFOX_PASSWORD set
    // (Hochbahn issues them per operator; a fork requests its own). .context/transit.md#hamburg
    transit: { provider: 'geofox', endpoint: 'https://gti.geofox.de' },
    police: {
      provider: 'rss',
      // Polizei Hamburg's presseportal newsroom (6013, used until 2026-11-01, is Polizeipräsidium Mittelfranken)
      url: 'https://www.presseportal.de/rss/dienststelle_6337.rss2',
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
    // BNetzA Ladesäulenregister (CC BY 4.0), plus the live status of the ~2,540 public charge
    // points of Hamburger Energiewerke Mobil (EVSE operator DE*HHM) on the Urban Data Platform's
    // SensorThings API (dl-de/by-2.0, Transparenzportal "Elektro Ladestandorte Hamburg").
    // `operator` is the register's name for DE*HHM, for the ~105 live stations it lacks.
    evCharging: {
      provider: 'bnetza',
      kreis: 'Kreisfreie Stadt Hamburg',
      liveStatus: { provider: 'hamburg-sta', url: 'https://iot.hamburg.de/v1.1', operator: 'HEnW-Mobil' },
    },
    // Bauweiser construction sites on main roads (dl-de/by-2.0). The Transparenzportal's
    // baustellen-hamburg WFS is an archive frozen in 2020.
    roadworks: { provider: 'hamburg-ogc', url: 'https://api.hamburg.de/datasets/v1/baustellen/collections/baustelle/items?f=json&limit=1000' },
    // The 17 EU bathing spots and their samples (Behörde für Umwelt und Energie, dl-de/by-2.0)
    bathing: { provider: 'hamburg-wfs', url: 'https://geodienste.hamburg.de/HH_WFS_Badegewaesser' },
    pollen: {
      provider: 'dwd',
      regionId: 10,         // Schleswig-Holstein und Hamburg
      partregionId: 12,     // Geest, Schleswig-Holstein und Hamburg
    },
    // The Bürgerschaft's committee and plenary sessions from its website calendar
    // (official public records, no licence stated). The Bezirksversammlungen' ALLRIS
    // (sitzungsdienst-<bezirk>.hamburg.de) lists no OParl endpoint: .context/council-meetings.md.
    councilMeetings: {
      hamburgBuergerschaft: {
        calendarUrl: 'https://www.hamburgische-buergerschaft.de/aktuelles/termine/1042880!search',
      },
    },
    laborMarket: { provider: 'ba', scope: 'bundesland', name: 'Hamburg' },
    // RKI AMELAG (CC BY 4.0): Hamburg's two plants, serving about 0.58 and 1.46 million people
    wastewater: { provider: 'amelag', sites: ['Hamburg 01', 'Hamburg 02'] },
    // StadtRAD's bikes per station on the Urban Data Platform's SensorThings API (dl-de/by-2.0,
    // Transparenzportal "StadtRAD-Stationen Hamburg"): ~360 stations, no docks. No nextbike in Hamburg.
    bikeSharing: { provider: 'hamburg-sta', url: 'https://iot.hamburg.de/v1.1', system: 'StadtRAD Hamburg', operator: 'DB Connect' },
    waterLevels: {
      provider: 'pegelonline',
      stations: [
        { uuid: 'd488c5cc-4de9-4631-8ce1-0db0e700b546', name: 'St. Pauli', waterBody: 'Elbe', tidal: true },
        { uuid: 'ae1b91d0-e746-4f65-9f64-2d2e23603a82', name: 'Bunthaus', waterBody: 'Elbe', tidal: true },
        { uuid: '816affba-0118-4668-887f-fb882ed573b2', name: 'Seemannshöft', waterBody: 'Elbe', tidal: true },
      ],
    },
    // Sozialmonitoring Integrierte Stadtteilentwicklung, report annex (dl-de/by-2.0): 857
    // Statistische Gebiete, data as of 31 Dec of the year before the report. A new GUID
    // each year: find it on the Transparenzportal ("Sozialmonitoring Bericht Anhang").
    // The outlines, from the dataset's OGC API, ship in packages/server/data.
    socialAtlas: {
      provider: 'hh-sozialmonitoring',
      xlsxUrl: 'https://daten.transparenz.hamburg.de/Dataport.HmbTG.ZS.Webservice.GetRessource100/GetRessource100.svc/ee0ecec9-c569-43ca-bc90-fc3f560ff1a9/Upload__Sozialmonitoring-Bericht_2025_Ergebnistabellen.XLSX',
      reportYear: 2025,
      outlines: 'hamburg-statistische-gebiete.geojson',
    },
    // Regionalstatistische Daten der Stadtteile (Statistikamt Nord, dl-de/by-2.0): 99
    // Stadtteile, yearly. Fetched without geometry; the outlines ship in packages/server/data.
    population: {
      provider: 'hh-stadtteile',
      itemsUrl: 'https://api.hamburg.de/datasets/v1/regionalstatistische_daten_stadtteile/collections/regionalstatistische_daten_stadtteile/items',
      outlines: 'hamburg-stadtteile.geojson',
    },
  },
};
