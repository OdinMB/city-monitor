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
    zoom: 11,
    minZoom: 9,
    maxZoom: 17,
    bounds: [
      [12.9, 52.3],
      [13.8, 52.7],
    ],
  },
  theme: { accent: '#E2001A' },
  feeds: [
    // rbb24's feed says its content must not be archived (see .context/news.md)
    { name: 'rbb24', url: 'https://www.rbb24.de/index.xml/feed=rss.xml', tier: 1, type: 'mainstream', lang: 'de', storeText: false },
    { name: 'Tagesspiegel', url: 'https://www.tagesspiegel.de/contentexport/feed/home', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'Berliner Morgenpost', url: 'https://www.morgenpost.de/berlin/rss', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'Berliner Zeitung', url: 'https://www.berliner-zeitung.de/feed.xml', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'Polizei Berlin', url: 'https://www.berlin.de/presse/pressemitteilungen/index/feed?institutions[]=Polizei+Berlin', tier: 1, type: 'gov', lang: 'de', category: 'crime' },
    { name: 'Gründerszene Berlin', url: 'https://www.businessinsider.de/gruenderszene/feed/', tier: 3, type: 'tech', lang: 'de' },
  ],
  dataSources: {
    weather: { provider: 'brightsky', lat: 52.52, lon: 13.405 },
    transit: {
      provider: 'hafas',
      operatorId: 'VBB',
      endpoint: 'https://v6.vbb.transport.rest',
      stations: [
        { id: '900100003', name: 'Alexanderplatz' },
        { id: '900003201', name: 'Hauptbahnhof' },
        { id: '900120005', name: 'Zoologischer Garten' },
        { id: '900100001', name: 'Friedrichstraße' },
        { id: '900007102', name: 'Gesundbrunnen' },
        { id: '900120004', name: 'Ostkreuz' },
        { id: '900058101', name: 'Südkreuz' },
        { id: '900024101', name: 'Westkreuz' },
        { id: '900013101', name: 'Nollendorfplatz' },
        { id: '900017101', name: 'Mehringdamm' },
        { id: '900013102', name: 'Hermannplatz' },
        { id: '900029101', name: 'Spandau' },
      ],
    },
    airQuality: {
      sensorCommunityStations: [
        { sensorId: 25905, name: 'Spandau', fallbackIds: [828, 51034] },
        { sensorId: 5040, name: 'Reinickendorf', fallbackIds: [11957, 40765] },
        { sensorId: 57233, name: 'Tegel', fallbackIds: [2211, 88791] },
        { sensorId: 23322, name: 'Marzahn-Hellersdorf', fallbackIds: [87879, 43640] },
        { sensorId: 9409, name: 'Marzahn-Nord', fallbackIds: [13733, 18376] },
        { sensorId: 7051, name: 'Treptow-Köpenick', fallbackIds: [60516, 91390] },
        { sensorId: 81508, name: 'Grünau', fallbackIds: [95842, 52480] },
        { sensorId: 1376, name: 'Lichtenberg', fallbackIds: [83562, 44120] },
        { sensorId: 68686, name: 'Hohenschönhausen', fallbackIds: [9767, 84379] },
        { sensorId: 19095, name: 'Charlottenburg', fallbackIds: [93671, 50066] },
        { sensorId: 70607, name: 'Westend', fallbackIds: [12603, 47089] },
        { sensorId: 15536, name: 'Zehlendorf', fallbackIds: [26261, 97662] },
        { sensorId: 3036, name: 'Pankow', fallbackIds: [48036, 18814] },
        { sensorId: 80508, name: 'Französisch Buchholz', fallbackIds: [13090, 43626] },
      ],
      // The 15 active BLUME stations in the UBA station list (checked 2026-11-03)
      ubaStations: [
        'DEBE010', 'DEBE027', 'DEBE032', 'DEBE034', 'DEBE051', 'DEBE056', 'DEBE061', 'DEBE062',
        'DEBE065', 'DEBE066', 'DEBE068', 'DEBE069', 'DEBE125', 'DEBE126', 'DEBE127',
      ],
    },
    events: [
      { source: 'kulturdaten', url: 'https://api-v2.kulturdaten.berlin/api/events' },
      { source: 'ticketmaster', url: 'https://app.ticketmaster.com/discovery/v2/events.json' },
      { source: 'gomus', url: 'https://smb.gomus.de/api/v4/events' },
    ],
    police: {
      provider: 'rss',
      url: 'https://www.berlin.de/presse/pressemitteilungen/index/feed?institutions[]=Polizei+Berlin',
      districts: [
        'Mitte', 'Friedrichshain', 'Kreuzberg', 'Pankow', 'Prenzlauer Berg',
        'Charlottenburg', 'Wilmersdorf', 'Spandau', 'Steglitz', 'Zehlendorf',
        'Tempelhof', 'Schöneberg', 'Neukölln', 'Treptow', 'Köpenick',
        'Marzahn', 'Hellersdorf', 'Lichtenberg', 'Reinickendorf', 'Wedding',
        'Moabit', 'Tiergarten',
      ],
    },
    nina: { ars: '110000000000' },
    // BNetzA Ladesäulenregister (CC BY 4.0): ~4,950 charging devices, ~3,460 places (2026-09-01 edition)
    evCharging: { provider: 'bnetza', kreis: 'Kreisfreie Stadt Berlin' },
    roadworks: { provider: 'viz-berlin', url: 'https://api.viz.berlin.de/daten/baustellen_sperrungen.json' },
    // LAGeSo's latest sample per bathing spot (seasonal; the URL is stable)
    bathing: { provider: 'lageso', url: 'https://data.lageso.de/baden/0_letzte/letzte.csv' },
    waterLevels: {
      provider: 'pegelonline',
      stations: [
        { uuid: '09e15cf6-f155-4b76-b92f-6c260839121c', name: 'Mühlendamm', waterBody: 'Spree' },
        { uuid: 'd89eb759-58c4-43f4-9fe4-e6a21af23f5c', name: 'Charlottenburg', waterBody: 'Spree' },
        { uuid: '47d3e815-c556-4e1b-93de-9fe07329fb00', name: 'Köpenick', waterBody: 'Spree' },
        { uuid: '2c68509c-bf1e-4866-9ec4-b26b231e5e04', name: 'Spandau', waterBody: 'Havel' },
        { uuid: '6b595707-8c47-4bc7-a803-dbc327775c26', name: 'Schmöckwitz', waterBody: 'Dahme' },
      ],
    },
    // Water temperature from the Wasserportal Berlin (dl-de/by-2.0, datenregister "Gewässerkundliche
    // Messdaten"), every 15 min where the station sends online, otherwise in batches a day or two late.
    // Ids are station numbers (wasserportal.berlin.de/messwerte.php?anzeige=tabelle&thema=owt lists all
    // ~65); the first four are quality stations (MS/MPS, coordinates converted from the portal's UTM 33N),
    // the rest gauges, located from the pegelstandorte WFS (checked 2026-11-03).
    waterTemperature: {
      provider: 'wasserportal',
      stations: [
        { id: '139', name: 'Fischerinsel', waterBody: 'Spree', lat: 52.51393, lon: 13.41077 },
        { id: '161', name: 'Sophienwerder', waterBody: 'Spree', lat: 52.53615, lon: 13.21628 },
        { id: '111', name: 'Rahnsdorf', waterBody: 'Müggelspree', lat: 52.42973, lon: 13.68895 },
        { id: '211', name: 'Schmöckwitz', waterBody: 'Dahme', lat: 52.3743, lon: 13.65347 },
        { id: '5803500', name: 'Pfaueninsel', waterBody: 'Havel', lat: 52.43028, lon: 13.12392 },
        { id: '5870100', name: 'Lichterfelde', waterBody: 'Teltowkanal', lat: 52.41998, lon: 13.30320 },
        { id: '5866301', name: 'Zoo', waterBody: 'Landwehrkanal', lat: 52.51045, lon: 13.33857 },
        { id: '5800312', name: 'Plötzensee', waterBody: 'Plötzensee', lat: 52.5427, lon: 13.3308 },
        { id: '5800107', name: 'Am Wolfsschluchtkanal', waterBody: 'Krumme Lanke', lat: 52.44738, lon: 13.23039 },
        { id: '5800305', name: 'Groß Glienicker See', waterBody: 'Groß Glienicker See', lat: 52.4592, lon: 13.11282 },
      ],
    },
    budget: {
      provider: 'berlin-doppelhaushalt',
      csvUrl: 'https://www.berlin.de/sen/finanzen/service/daten/260223_doppelhaushalt_2026_2027.csv',
    },
    socialAtlas: {
      provider: 'mss-wfs',
      // MSS 2025 (data as of 2024-12-31); the next edition, MSS 2027, is due in 2027
      wfsUrl: 'https://gdi.berlin.de/services/wfs/mss_2025',
    },
    // Einwohnerregisterstatistik per Planungsraum (CC BY), half-yearly. The URL's hash
    // segments change with each edition: copy it from
    // https://www.statistik-berlin-brandenburg.de/a-i-16-hj. The polygons come from the
    // social atlas, so this job runs after it.
    population: {
      provider: 'afstat-ewr-xlsx',
      // 30 June 2026
      xlsxUrl: 'https://download.statistik-berlin-brandenburg.de/fca0a030166493d0/1289b0921aa2/SB_A01-16-00_2026h01_BE.xlsx',
    },
    laborMarket: { provider: 'ba', scope: 'bundesland', name: 'Berlin' },
    // Berlin's grid is in 50Hertz's control area (SMARD, CC BY 4.0)
    electricity: { provider: 'smard', controlArea: '50Hertz' },
    // DWD soil moisture (CC BY 4.0) at three stations across the city, and the
    // street-tree waterings logged on Gieß den Kiez (CC0, daten.berlin.de "gdk-nutzungsdaten")
    soilMoisture: {
      provider: 'dwd',
      stations: [
        { id: '433', name: 'Berlin-Tempelhof' },
        { id: '403', name: 'Berlin-Dahlem (FU)' },
        { id: '400', name: 'Berlin-Buch' },
      ],
      treeWatering: {
        provider: 'giessdenkiez',
        csvUrl: 'https://raw.githubusercontent.com/technologiestiftung/giessdenkiez-de-opendata/main/daten/giessdenkiez_bew%C3%A4sserungsdaten.csv',
      },
    },
    // Influenza A/B and RSV from LAGeSo (dl-de/by-2.0); SARS-CoV-2 from the same three plants in AMELAG
    wastewater: {
      provider: 'lageso',
      csvUrl: 'https://data.lageso.de/infektionsschutz/opendata/abwassermonitoring/BEWAC_abwassermonitoring_berlin.csv',
      sites: ['Berlin Ruhleben', 'Berlin Schönerlinde', 'Berlin Waßmannsdorf'],
    },
    // RKI IfSG flu and RSV notifications (CC BY 4.0), by Land: Berlin is one
    respiratoryCases: { provider: 'rki-ifsg', regionId: '11' },
    pollen: {
      provider: 'dwd',
      regionId: 50,         // Brandenburg und Berlin
      partregionId: -1,     // no sub-regions
    },
    // Heat relief from GDI Berlin's WFS, all dl-de/zero-2.0 (daten.berlin.de, checked 2026-11-03):
    // 126 cool rooms of the Hitzeschutz plan, 242 BWB fountains (May–October), 525 toilets
    heatRelief: [
      { kind: 'cool', provider: 'berlin-cool-rooms', url: 'https://gdi.berlin.de/services/wfs/kuehle_raeume' },
      { kind: 'fountain', provider: 'berlin-fountains', url: 'https://gdi.berlin.de/services/wfs/trinkwasserbrunnen' },
      { kind: 'toilet', provider: 'berlin-toilets', url: 'https://gdi.berlin.de/services/wfs/toiletten' },
    ],
    noiseSensors: {
      provider: 'sensor-community',
      lat: 52.52,
      lon: 13.405,
      radius: 15,
    },
    // nextbike Berlin's GBFS (CC0-1.0, stated in its system_information): ~1,080 stations
    // Lifts and escalators at DB stations (FaSta, CC BY 4.0); fetched only with DB_API_CLIENT_ID and DB_API_KEY
    stationLifts: { provider: 'db-fasta' },
    // Hospitals by G-BA emergency tier; on unless KLINIK_ATLAS=false (reuse terms not stated)
    hospitals: [{ provider: 'klinik-atlas', places: ['Berlin'] }],
    bikeSharing: { provider: 'gbfs', url: 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_bn/gbfs.json', system: 'nextbike Berlin', operator: 'nextbike' },
    // Unfallatlas (dl-de/by-2.0): the whole Land, ~13,300 injury accidents in 2025
    trafficAccidents: { provider: 'unfallatlas', ags: '11000000' },
    // Berlin zählt Mobilität (CC BY 4.0): citizen Telraam sensors, ~100 Berlin segments counting each day
    telraamCounts: { provider: 'berlin-zaehlt', baseUrl: 'https://berlin-zaehlt.de/csv/', region: 'DE-BE' },
    // Abgeordnetenhaus 2026, final result per Wahlbezirk (Amt für Statistik Berlin-Brandenburg,
    // CC BY 3.0 DE), summed to the 78 Wahlkreise of the outlines (WFS wahlgebiete_agh2026, CC BY 3.0)
    electionResults: {
      provider: 'berlin-agh-xlsx',
      url: 'https://www.wahlen-berlin.de/wahlen/BE2026/Afspraes/AGH/DL/DL_BE_AGHBVV2026.xlsx',
      election: 'abgeordnetenhaus',
      date: '2026-09-20',
      outlines: 'berlin-agh2026-wahlkreise.geojson',
    },
    // Kriminalitätsatlas Berlin (Polizei Berlin, CC BY-SA): cases and rates per Bezirksregion,
    // 2016–2025 in one file. The name carries the year range: copy the new link from
    // daten.berlin.de "Kriminalitätsatlas Berlin" when the next year appears (checked 2026-11-03).
    crimeAtlas: {
      provider: 'polizei-berlin',
      xlsxUrl: 'https://www.berlin.de/polizei/_assets/dienststellen/lka/fallzahlen_hz-2016-2025.xlsx',
      outlines: 'berlin-bezirksregionen.geojson',
    },
    appointments: {
      provider: 'service-berlin',
      // Ids are service.berlin.de/dienstleistung/{id}/: open that page to check
      // an id names the service before adding it. A wrong id scrapes another
      // service's calendar under this label.
      services: [
        { id: '120686', name: 'Anmeldung' },
        { id: '120703', name: 'Personalausweis' },
        { id: '121151', name: 'Reisepass' },
        { id: '120926', name: 'Führungszeugnis' },
        { id: '120702', name: 'Meldebescheinigung' },
        { id: '120697', name: 'Hauptwohnung ändern' },
        { id: '121701', name: 'Beglaubigung' },
        { id: '121616', name: 'Führerschein umtauschen' },
        { id: '121627', name: 'Führerschein erstmalig' },
        { id: '121721', name: 'Bewohnerparkausweis' },
      ],
    },
    councilMeetings: {
      bvv: [
        { district: 'Mitte', baseUrl: 'https://www.sitzungsdienst-mitte.de/oi/oparl/1.0' },
        { district: 'Pankow', baseUrl: 'https://www.sitzungsdienst-pankow.de/oi/oparl/1.0' },
        { district: 'Charlottenburg-Wilmersdorf', baseUrl: 'https://www.sitzungsdienst-charlottenburg-wilmersdorf.de/oi/oparl/1.0' },
        { district: 'Friedrichshain-Kreuzberg', baseUrl: 'https://www.sitzungsdienst-friedrichshain-kreuzberg.de/oi/oparl/1.0' },
        { district: 'Neukölln', baseUrl: 'https://www.sitzungsdienst-neukoelln.de/oi/oparl/1.0' },
        { district: 'Steglitz-Zehlendorf', baseUrl: 'https://www.sitzungsdienst-steglitz-zehlendorf.de/oi/oparl/1.0' },
        { district: 'Treptow-Köpenick', baseUrl: 'https://www.sitzungsdienst-treptow-koepenick.de/oi/oparl/1.0' },
        { district: 'Marzahn-Hellersdorf', baseUrl: 'https://www.sitzungsdienst-marzahn-hellersdorf.de/oi/oparl/1.0' },
        { district: 'Lichtenberg', baseUrl: 'https://www.sitzungsdienst-lichtenberg.de/oi/oparl/1.0' },
        { district: 'Reinickendorf', baseUrl: 'https://www.sitzungsdienst-reinickendorf.de/oi/oparl/1.0' },
        { district: 'Tempelhof-Schöneberg', baseUrl: 'https://www.sitzungsdienst-tempelhof-schoeneberg.de/oi/oparl/1.0' },
      ],
      parliament: {
        committeeUrl: 'https://www.parlament-berlin.de/app_com.xml',
        plenaryUrl: 'https://www.parlament-berlin.de/app_plen.xml',
      },
    },
  },
};
