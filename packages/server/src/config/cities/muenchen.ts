import type { CityConfig } from '@city-monitor/shared';

/**
 * München, wired only to the Germany-wide sources (DWD, Open-Meteo, NINA,
 * OpenStreetMap, aponet.de). No PEGELONLINE gauge: the Isar through München
 * is a Bavarian water, not a federal waterway, so the city has no water
 * levels; its flood class comes from the LHP instead (floodStatus). News feeds, roadworks and council meetings (RIS RSS feeds) are
 * configured; police has no usable source (polizei.bayern.de's robots.txt
 * disallows all, and the Polizeipräsidium is not on presseportal). The other
 * city-specific sources (transit, events) are not configured yet, so their
 * jobs fetch nothing for München. Its Stadtbezirk outlines ship with the web
 * app (packages/web/src/data/districts), and again with each district's area
 * in packages/server/data for the social atlas and population, which the
 * Indikatorenatlas gives per Stadtbezirk.
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
  feeds: [
    // Licence verdicts: .context/news.md, "Köln and München feed status". Süddeutsche
    // and tz forbid automated access; Abendzeitung and Rathaus Umschau await permission.
    // BR24 Oberbayern is RSS 1.0 (RDF) and covers all of Oberbayern; the classifier
    // drops what isn't about München.
    { name: 'BR24 Oberbayern', url: 'https://nachrichtenfeeds.br.de/rdf/boards/UZlJdUE', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'Feuerwehr München', url: 'https://www.presseportal.de/rss/dienststelle_131419.rss2', tier: 2, type: 'gov', lang: 'de' },
  ],
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
    // The Kreis table of the kreisfreie Stadt; AA München's district is wider than the city
    laborMarket: { provider: 'ba', scope: 'kreis', name: 'München, Landeshauptstadt' },
    electricity: { provider: 'smard', controlArea: 'TenneT' },
    wastewater: { provider: 'amelag', sites: ['München'] }, // RKI AMELAG (CC BY 4.0), about 1.24 million people
    // The Isar's flood class (Meldestufe) from the LHP public API (CC BY 4.0): the HND gauge
    // München (16005701, Meldestufen at 240/300/380 cm and a 4th) and Puppling, the last
    // gauge upstream, about 25 km south. LHP gives no water levels (checked 2026-11-01).
    floodStatus: {
      provider: 'lhp',
      state: 'BY',
      stations: [
        { id: 'BY_16005701', name: 'München', waterBody: 'Isar' },
        { id: 'BY_16004403', name: 'Puppling', waterBody: 'Isar', upstream: true },
      ],
    },
    // Roadworks and no-parking zones of the coming four weeks (dl-de/by-2.0); the job adds a
    // CQL filter for works on the carriageway (lib/roadworks-parsers.ts).
    roadworks: {
      provider: 'muenchen-wfs',
      url: 'https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=mor_wfs:baustellen_opendata&outputFormat=application/json&srsName=EPSG:4326',
    },
    // The RIS has no OParl; its RSS feeds list the next ~10 days of Stadtrat
    // and Bezirksausschuss meetings (official public records, no licence stated).
    councilMeetings: {
      muenchenRis: {
        councilFeedUrl: 'https://risi.muenchen.de/risi/rss?feed=StR-Sitzungen',
        districtFeedUrl: 'https://risi.muenchen.de/risi/rss?feed=BA-Sitzungen',
      },
    },
    // Indikatorenatlas of the Statistisches Amt (dl-de/by-2.0), one CKAN dataset per indicator,
    // yearly, at the 25 Stadtbezirke only (no finer level is kept up to date). The outlines
    // (GeodatenService, dl-de/by-2.0) ship in packages/server/data. The social atlas pins the
    // year its labels name: the labour-market figures for 2025 come out around May 2027.
    socialAtlas: {
      provider: 'muenchen-indikatorenatlas',
      ckanApi: 'https://opendata.muenchen.de/api/3/action',
      datasets: {
        unemployment: 'indikatorenatlas-2014-arbeitsmarkt-arbeitslosendichte-83r65mct',
        singleParent: 'indikatorenatlas-bevoelkerung-haushalte-alleinerziehend',
        welfare: 'indikatorenatlas-2014-arbeitsmarkt-regel-leistungsberechtigte-erwerbsfaehig-anteil-83r65mct',
        childPoverty: 'indikatorenatlas-arbeitsmarkt-regel-leistungsberechtigte-nicht-erwerbsfaehig-anteil-83r65mct',
      },
      year: 2024,
      outlines: 'muenchen-stadtbezirke.geojson',
    },
    // Population takes the newest year in the files (2025 as of 2026-11).
    population: {
      provider: 'muenchen-indikatorenatlas',
      ckanApi: 'https://opendata.muenchen.de/api/3/action',
      datasets: {
        ageGroups: 'indikatorenatlas-bevoelkerung-altersgruppen-83r65mct',
        foreign: 'indikatorenatlas-bevoelkerung-nichtdeutsche-83r65mct',
      },
      outlines: 'muenchen-stadtbezirke.geojson',
    },
  },
};
