import type { CityConfig } from '@city-monitor/shared';

/**
 * Köln: the Germany-wide sources (DWD, Open-Meteo, NINA, PEGELONLINE) plus
 * news feeds, Polizei Köln, the city's roadworks WFS, its own events and its
 * council information system, and KVB's lift and escalator outages. Transit
 * disruptions are not configured (KVB publishes none as data), so the transit
 * job fetches nothing for Köln. Its Stadtbezirk outlines ship with the web app
 * (packages/web/src/data/districts).
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
  feeds: [
    // Licence verdicts: .context/news.md, "Köln and München feed status". Kölnische
    // Rundschau is left out: same DuMont newsroom as the Stadt-Anzeiger, same items.
    // WDR covers the whole Rheinland; the classifier drops what isn't about Köln.
    { name: 'WDR Rheinland', url: 'https://www1.wdr.de/nrw/rheinland/uebersicht-rheinland-100.feed', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'Kölner Stadt-Anzeiger', url: 'https://feed.ksta.de/feed/rss/koeln/index.rss', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'EXPRESS', url: 'https://feed.express.de/feed/rss/koeln/index.rss', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'Stadt Köln', url: 'https://www.stadt-koeln.de/externe-dienste/rss/pressemeldungen.xml', tier: 2, type: 'gov', lang: 'de' },
  ],
  dataSources: {
    police: {
      provider: 'rss',
      // Polizei Köln's presseportal newsroom; it also covers Leverkusen.
      url: 'https://www.presseportal.de/rss/dienststelle_12415.rss2',
      // Matched as substrings of the title, first match wins, so longer names come
      // before the shorter names they contain (Weidenpesch before Weiden and Pesch).
      // Left out because they are common words or parts of other names: Brück
      // (Brücke), Eil, Esch, Lind, Rath, Wahn, Weiß.
      districts: [
        // Stadtbezirke
        'Innenstadt', 'Rodenkirchen', 'Lindenthal', 'Ehrenfeld', 'Nippes',
        'Chorweiler', 'Porz', 'Kalk', 'Mülheim',

        // Innenstadt
        'Altstadt-Nord', 'Altstadt-Süd', 'Neustadt-Nord', 'Neustadt-Süd', 'Deutz',

        // Rodenkirchen
        'Bayenthal', 'Marienburg', 'Raderberg', 'Raderthal', 'Zollstock',
        'Rondorf', 'Hahnwald', 'Sürth', 'Godorf', 'Immendorf', 'Meschenich',

        // Lindenthal
        'Braunsfeld', 'Müngersdorf', 'Junkersdorf', 'Lövenich', 'Widdersdorf',
        'Sülz', 'Klettenberg',

        // Ehrenfeld
        'Neuehrenfeld', 'Bickendorf', 'Ossendorf', 'Vogelsang', 'Bocklemünd',

        // Nippes (Weidenpesch before Weiden and Pesch)
        'Weidenpesch', 'Mauenheim', 'Riehl', 'Niehl', 'Longerich', 'Bilderstöckchen',

        // Lindenthal, after Weidenpesch
        'Weiden',

        // Chorweiler
        'Blumenberg', 'Fühlingen', 'Heimersdorf', 'Lindweiler', 'Merkenich',
        'Pesch', 'Roggendorf', 'Seeberg', 'Volkhoven', 'Worringen', 'Auweiler',

        // Porz (Gremberghoven before Kalk's Humboldt/Gremberg)
        'Zündorf', 'Wahnheide', 'Westhoven', 'Ensen', 'Gremberghoven',
        'Finkenberg', 'Grengel', 'Urbach', 'Elsdorf', 'Langel', 'Libur',

        // Kalk
        'Humboldt/Gremberg', 'Vingst', 'Höhenberg', 'Ostheim', 'Merheim',
        'Neubrück', 'Rath/Heumar',

        // Mülheim
        'Buchforst', 'Buchheim', 'Holweide', 'Dellbrück', 'Höhenhaus',
        'Dünnwald', 'Stammheim', 'Flittard',

        // Not Köln: Polizei Köln reports for Leverkusen too ("…-LEV" in the title).
        'Leverkusen',
      ],
    },
    // DWD warn cell 105315000, by its name: warnings for this region alone.
    weather: { provider: 'brightsky', lat: 50.9375, lon: 6.9603, dwdWarnRegion: 'Stadt Köln' },
    nina: { ars: '053150000000' }, // kreisfreie Stadt Köln, AGS 05315000
    // BNetzA Ladesäulenregister (CC BY 4.0): ~1,480 charging devices, ~770 places
    evCharging: { provider: 'bnetza', kreis: 'Kreisfreie Stadt Köln' },
    aeds: { adminLevel: 6 },       // OSM boundary "Köln" of the kreisfreie Stadt
    pollen: {
      provider: 'dwd',
      regionId: 40,         // Nordrhein-Westfalen
      partregionId: 41,     // Rhein.-Westfäl. Tiefland
    },
    // The Kreis table of the kreisfreie Stadt, not the wider Agentur für Arbeit district
    laborMarket: { provider: 'ba', scope: 'kreis', name: 'Köln, Stadt' },
    wastewater: { provider: 'amelag', sites: ['Köln'] }, // RKI AMELAG (CC BY 4.0), about 0.86 million people
    waterLevels: {
      provider: 'pegelonline',
      stations: [
        { uuid: 'a6ee8177-107b-47dd-bcfd-30960ccc6e9c', name: 'Köln', waterBody: 'Rhein' },
      ],
    },
    // Permitted roadworks (dl-de/zero-2.0). Of the WFS's 15 layers, the ones that take road
    // space: building construction, site set-up, containers, aerial platforms and green-space
    // works are left out, being mostly on pavements and private plots.
    roadworks: {
      provider: 'koeln-wfs',
      url: 'https://geoportal.stadt-koeln.de/wss/service/baustellen_wfs/guest',
      layers: [
        'strassenbauarbeiten', 'versorgungsarbeiten', 'kanalsanierung', 'ampelarbeiten', 'notfall',
        'brueckenarbeiten', 'gleisbau', 'tunnelarbeiten', 'markierungsarbeiten', 'sondierungsarbeiten',
      ],
    },
    // KVB's lifts and escalators out of service (dl-de/zero-2.0 on open.nrw), every 15 min.
    // KVB publishes no line disruptions as data, so this is Köln's only transit signal.
    liftOutages: { provider: 'kvb', url: 'https://data.webservice-kvb.koeln/service/opendata' },
    // KVB-Rad, run by nextbike: its GBFS (CC0-1.0), ~310 stations, 120 of them virtual (no docks)
    bikeSharing: { provider: 'gbfs', url: 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_kg/gbfs.json', system: 'KVB-Rad', operator: 'nextbike' },
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
    // Statistischer Datenkatalog (dl-de/by-2.0), one yearly CSV for both layers, at the
    // 570 Statistische Quartiere. The outlines (dl-de/zero-2.0) ship in packages/server/data.
    // The social atlas pins the year its labels name; population takes the newest year.
    socialAtlas: {
      provider: 'koeln-datenkatalog',
      csvUrl: 'https://www.offenedaten-koeln.de/sites/default/files/uploaded_resources/Stadt_K%C3%B6ln_Statistischer_Datenkatalog_0.csv',
      year: 2025,
      outlines: 'koeln-quartiere.geojson',
    },
    population: {
      provider: 'koeln-datenkatalog',
      csvUrl: 'https://www.offenedaten-koeln.de/sites/default/files/uploaded_resources/Stadt_K%C3%B6ln_Statistischer_Datenkatalog_0.csv',
      outlines: 'koeln-quartiere.geojson',
    },
  },
};
