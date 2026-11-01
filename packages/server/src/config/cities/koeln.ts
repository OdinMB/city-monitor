import type { CityConfig } from '@city-monitor/shared';

/**
 * Köln: the Germany-wide sources (DWD, Open-Meteo, NINA, PEGELONLINE) plus
 * news feeds and Polizei Köln. The other city-specific sources (transit,
 * events, council meetings, district boundaries) are not configured yet, so
 * their jobs fetch nothing for Köln.
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
