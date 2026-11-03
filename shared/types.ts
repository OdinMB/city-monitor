import type { CouncilMeeting } from './schemas.js';

/** Standard API response wrapper with freshness metadata */
export interface ApiResponse<T> {
  data: T;
  fetchedAt: string | null;
}

/** A single point in a historical time-series */
export interface HistoryPoint {
  timestamp: string;
  value: number;
}

export interface CityConfig {
  id: string;
  name: string;
  country: string;
  coordinates: { lat: number; lon: number };
  boundingBox: { north: number; south: number; east: number; west: number };
  timezone: string;
  languages: string[];
  map: {
    center: [number, number];
    zoom: number;
    minZoom?: number;
    maxZoom?: number;
    bounds?: [[number, number], [number, number]];
    style?: string;
    layers?: CityMapLayer[];
  };
  theme: { accent: string };
  feeds: FeedConfig[];
  dataSources: CityDataSources;
}

/**
 * What a city has data for, beyond what every city gets (weather, air quality,
 * rain radar and traffic incidents). The web app
 * shows a tile, a map layer or a sub-layer only for the features its city
 * config lists (packages/web/src/lib/city-features.ts).
 *
 * Most come from the server's ingestion: `cityFeatures` in
 * packages/server/src/lib/city-features.ts derives them from a server config,
 * and packages/web/src/config/index.test.ts checks that each web config lists
 * exactly those. The rest are the web app's own (WEB_ONLY_FEATURES there): a
 * map service or a directory the browser shows for the city.
 */
export type CityFeature =
  // From the server config's feeds and dataSources
  | 'news'            // feeds: briefing, news tiles, news map layer
  | 'police'          // dataSources.police: police reports on the map
  | 'nina'            // dataSources.nina: civil-protection warnings
  | 'pollen'
  | 'waterLevels'
  | 'floodStatus'     // dataSources.floodStatus: flood class of state gauges (LHP)
  | 'transit'
  | 'events'
  | 'appointments'
  | 'budget'
  | 'roadworks'
  | 'socialAtlas'     // dataSources.socialAtlas: the social map layer's indicator sub-layers
  | 'population'      // dataSources.population: population map layer and tile
  | 'laborMarket'     // dataSources.laborMarket: BA unemployment figures
  | 'wastewater'      // dataSources.wastewater: viral load in wastewater
  | 'respiratoryCases' // dataSources.respiratoryCases: RKI-notified flu and RSV cases, in the wastewater tile
  | 'noiseSensors'
  | 'councilMeetings'
  | 'bathing'         // dataSources.bathing: bathing-water quality (LAGeSo Berlin, Hamburg WFS)
  | 'liftOutages'     // dataSources.liftOutages: lift and escalator outages (KVB Köln)
  | 'bikeSharing'     // dataSources.bikeSharing: bike-sharing stations on the map (nextbike GBFS, StadtRAD)
  | 'electricity'     // dataSources.electricity: generation mix of the grid control area, grid CO₂ and signal
  | 'airQualityStations' // dataSources.airQuality.ubaStations: official state-network stations (UBA)
  | 'citizenReports'  // dataSources.citizenReports: citizen issue reports (Open311), the reports map layer
  | 'trafficAccidents' // dataSources.trafficAccidents: last year's injury accidents on the map (Unfallatlas)
  | 'crimeAtlas'      // dataSources.crimeAtlas: recorded crime per area, the crime map layer (Kriminalitätsatlas Berlin)
  | 'carCounts'       // dataSources.trafficCounts with mode 'car': car counters on the traffic layer
  | 'bikeCounts'      // dataSources.trafficCounts with mode 'bike': bicycle counters on the traffic layer
  | 'evCharging'      // dataSources.evCharging: public charging stations on the map (BNetzA Ladesäulenregister)
  | 'evChargingLive'  // dataSources.evCharging.liveStatus: their charge points' live status (Hamburg)
  // The heat-relief map layer's sub-layers (dataSources.heatRelief, one list per kind)
  | 'coolPlaces'      // cool places of the city's heat-action plan (Kühle Orte)
  | 'drinkingFountains'
  | 'publicToilets'
  | 'soilMoisture'    // dataSources.soilMoisture: DWD soil moisture at the city's stations (drought tile)
  | 'treeWatering'    // dataSources.soilMoisture.treeWatering: street-tree waterings logged by residents (Gieß den Kiez)
  | 'telraamCounts'   // dataSources.telraamCounts: yesterday's street counts of citizen Telraam sensors (Berlin zählt Mobilität)
  | 'waterTemperature' // dataSources.waterTemperature: the water layer's temperature sub-layer (Wasserportal Berlin)
  | 'parking'         // dataSources.parking: car parks with live free spaces, the parking map layer (Hamburg)
  | 'electionResults' // dataSources.electionResults: the latest election per area, the political map's Election view
  // The emergencies map layer's sub-layers, which German cities have
  | 'pharmacies'      // emergency pharmacies: a postcode in CITY_PLZ (ingest-pharmacies.ts)
  | 'aeds'            // defibrillators from OpenStreetMap (dataSources.aeds)
  // From the political ingestion's own tables
  | 'political'       // PARLIAMENT_CONFIG: Bundestag and state parliament members
  | 'districtMayors'  // BEZIRKSBUERGERMEISTER
  | 'mayor'           // OBERBUERGERMEISTER: a city inside a state's Oberbürgermeister
  | 'stateByDistrict' // state members grouped by Bezirk
  // Berlin's own sources, ingested for Berlin alone
  | 'feuerwehr'
  // The web app's own
  | 'crisis'          // the crisis-service directory
  | 'rentMap'         // the rent map WMS
  | 'noiseMap'        // a strategic noise map WMS (road, rail, air)
  | 'noiseTotal'      // its all-sources layer
  | 'trafficFlowMap'  // a live congestion map WMS, the traffic layer's congestion sub-layer
  | 'streetTrees'     // the street-tree register WMS (STREET_TREES_WMS), the trees map layer
  | 'politicalMap'    // the political map layer, on the city's district outlines (DISTRICT_URLS)
  | 'bundestagByDistrict'; // its Bundestag view: constituencies named after Bezirke (Berlin, Hamburg)

/**
 * A city as the web app holds it: the shared identity and map, without the
 * server's ingestion settings (feeds, dataSources), and with the features the
 * city has.
 */
export type WebCityConfig = Omit<CityConfig, 'feeds' | 'dataSources'> & {
  features: readonly CityFeature[];
};

export interface FeedConfig {
  name: string;
  url: string;
  tier: 1 | 2 | 3 | 4;
  type: 'wire' | 'gov' | 'mainstream' | 'tech' | 'other';
  lang: string;
  category?: string;
  /**
   * false for a feed whose terms forbid archiving its content: its item
   * descriptions still reach the classifier and the in-memory digest, but
   * Postgres keeps only the title and link. Default true.
   */
  storeText?: boolean;
}

export interface CityMapLayer {
  id: string;
  type: 'geojson' | 'markers';
  source: string;
  style?: Record<string, unknown>;
}

export interface EventSourceConfig {
  source: CityEvent['source'];
  url: string;
  lookaheadDays?: number; // Default: 14
}

/**
 * A city's roadworks feed, by the provider whose format it is in. Each
 * provider has its own parser in packages/server/src/lib/roadworks-parsers.ts.
 */
export type RoadworksSource =
  /** VIZ Berlin's GeoJSON (baustellen_sperrungen.json) */
  | { provider: 'viz-berlin'; url: string }
  /** Hamburg's OGC API Features collection `baustelle` (Bauweiser) */
  | { provider: 'hamburg-ogc'; url: string }
  /** Stadt Köln's MapServer WFS, one request per layer (`ms:<layer>`) */
  | { provider: 'koeln-wfs'; url: string; layers: readonly string[] }
  /** München's GeoServer WFS GetFeature URL for `baustellen_opendata` (GeoJSON, EPSG:4326) */
  | { provider: 'muenchen-wfs'; url: string };

/**
 * A city's social-atlas source, by the provider whose format it is in. Each
 * provider has its own parser in packages/server/src/lib/social-atlas-parsers.ts,
 * which also says which of the four indicators it has. `outlines` names a
 * GeoJSON file in packages/server/data/ that holds the areas' polygons, for a
 * source that ships none.
 */
export type SocialAtlasSource =
  /** Berlin's Monitoring Soziale Stadtentwicklung WFS; the edition is the URL's last segment (`…/mss_2025`) */
  | { provider: 'mss-wfs'; wfsUrl: string }
  /** Stadt Köln's Statistischer Datenkatalog CSV, the rows of one year at the Statistische Quartier level */
  | { provider: 'koeln-datenkatalog'; csvUrl: string; year: number; outlines: string }
  /** Hamburg's Sozialmonitoring report annex (XLSX), one per report year */
  | { provider: 'hh-sozialmonitoring'; xlsxUrl: string; reportYear: number; outlines: string }
  /**
   * München's Indikatorenatlas: one CKAN dataset per indicator on `ckanApi`
   * (`…/api/3/action`), whose CSV is looked up on each run (its file name
   * carries the release date); the 25 Stadtbezirke of one year
   */
  | {
    provider: 'muenchen-indikatorenatlas';
    ckanApi: string;
    datasets: { unemployment: string; singleParent: string; welfare: string; childPoverty: string };
    year: number;
    outlines: string;
  };

/**
 * A city's population source, by provider; parsers in
 * packages/server/src/lib/population-parsers.ts.
 */
export type PopulationSource =
  /** Amt für Statistik Berlin-Brandenburg's half-yearly EWR XLSX; the polygons come from the social atlas */
  | { provider: 'afstat-ewr-xlsx'; xlsxUrl: string }
  /** The same Köln CSV as the social atlas: its newest year, compared with the year before */
  | { provider: 'koeln-datenkatalog'; csvUrl: string; outlines: string }
  /** Hamburg's "Regionalstatistische Daten der Stadtteile" (OGC API Features, no geometry fetched) */
  | { provider: 'hh-stadtteile'; itemsUrl: string; outlines: string }
  /** München's Indikatorenatlas age-group and non-German datasets (CKAN, as for the social atlas): the newest year, compared with the year before */
  | { provider: 'muenchen-indikatorenatlas'; ckanApi: string; datasets: { ageGroups: string; foreign: string }; outlines: string };

/**
 * A city's bathing-water feed, by the provider whose format it is in. Each
 * provider has its own parser in packages/server/src/cron/ingest-bathing.ts
 * (.context/water-levels.md, "Bathing Water Quality").
 */
export type BathingSource =
  /** LAGeSo Berlin's semicolon CSV of the latest sample per spot */
  | { provider: 'lageso'; url: string }
  /** Hamburg's WFS `HH_WFS_Badegewaesser`: spots and samples, as GeoJSON */
  | { provider: 'hamburg-wfs'; url: string };

/**
 * A city's lift and escalator outages, by provider. KVB Köln publishes the
 * lifts and escalators out of service at its stations (.context/lift-outages.md).
 */
export type LiftOutageSource =
  /** KVB's open-data service: `<url>/aufzugsstoerung/json` and `<url>/fahrtreppenstoerung/json` */
  { provider: 'kvb'; url: string };

/**
 * A city's bike-sharing system, by the provider whose format it is in. Each
 * provider has its own parser in packages/server/src/lib/bike-sharing-parsers.ts
 * (.context/bike-sharing.md). `system` and `operator` are shown in the map popup.
 */
export type BikeSharingSource =
  /** A GBFS 2.x system's auto-discovery file (`…/gbfs.json`); stations only, no free-floating bikes */
  | { provider: 'gbfs'; url: string; system: string; operator: string }
  /** Hamburg's StadtRAD on the Urban Data Platform's SensorThings API (`…/v1.1`) */
  | { provider: 'hamburg-sta'; url: string; system: string; operator: string };

/**
 * A city's car parks with live occupancy, by provider (.context/parking.md).
 * `hamburg-wfs`: the Urban Data Platform's car-park WFS (`…/wfs_parkhaeuser`),
 * fed by the city's Parkleitsystem; only the car parks that report free spaces
 * are kept.
 */
export type ParkingSource = { provider: 'hamburg-wfs'; url: string };

/**
 * A German transmission system operator's control area (Regelzone), spelled as
 * SMARD names its region: 50Hertz (Berlin, Hamburg and the east), Amprion (the
 * west, Köln), TenneT (a north–south band, Bavaria with München), TransnetBW
 * (Baden-Württemberg).
 */
export type ControlArea = '50Hertz' | 'Amprion' | 'TenneT' | 'TransnetBW';

/**
 * The electricity tile's sources (.context/electricity.md): SMARD's generation
 * for the control area whose grid serves the city, and Energy-Charts' Germany-wide
 * grid signal and CO₂ intensity, which have no regional values.
 */
export interface ElectricitySource {
  provider: 'smard';
  controlArea: ControlArea;
}

/**
 * A city's citizen issue reports (litter, broken street lights, potholes), by
 * provider. `open311` is a GeoReport v2 server, both of today's on Mark-a-Spot
 * (.context/citizen-reports.md).
 */
export type CitizenReportSource = {
  provider: 'open311';
  /** The GeoReport v2 base, without a trailing slash (`…/georeport/v2`); `/requests.json` is appended. */
  baseUrl: string;
  /**
   * A request's page on the city's portal: `{id}` is replaced by the
   * service_request_id, `{nid}` by Mark-a-Spot's node id (its extensions).
   */
  requestUrl: string;
};

/**
 * A city's injury accidents from the Unfallatlas of the Statistische Ämter des
 * Bundes und der Länder: one national file a year, filtered to the city by its
 * official municipality key (.context/traffic-accidents.md).
 */
export type TrafficAccidentSource = {
  provider: 'unfallatlas';
  /**
   * The 8-digit Amtlicher Gemeindeschlüssel: "05315000" for Köln. A city-state's
   * key ("11000000") matches the whole Land, whose Bezirke the file codes in the
   * Kreis and Gemeinde digits.
   */
  ags: string;
};

/** What a traffic counter counts: motor vehicles or bicycles. */
export type TrafficCountMode = 'car' | 'bike';

/**
 * A city's live traffic counters, by the provider whose format they are in
 * (packages/server/src/lib/traffic-count-parsers.ts, .context/traffic-counts.md).
 * `modes` names what the city's counters count; each mode is a sub-layer of
 * the traffic map layer.
 */
export type TrafficCountSource =
  /**
   * Hamburg's infrared counters on the Urban Data Platform's SensorThings API
   * (`url`, `…/v1.1`), hourly; the counting sites' names from the
   * Verkehrszählstellen WFS (`sitesWfsUrl`).
   */
  { provider: 'hamburg-sta'; url: string; sitesWfsUrl: string; modes: readonly TrafficCountMode[] };

/**
 * A city's public charging stations from the Bundesnetzagentur's
 * Ladesäulenregister (one national CSV, read once per run for every city), with
 * an optional live status per charge point (.context/ev-charging.md).
 */
export interface EvChargingSource {
  provider: 'bnetza';
  /** The register's `Kreis/kreisfreie Stadt` value for the city, exactly as spelt there ("Kreisfreie Stadt Köln") */
  kreis: string;
  /**
   * Live status per charge point, merged onto the register's stations by EVSE id.
   * `hamburg-sta`: the Urban Data Platform's SensorThings API (`…/v1.1`), layer `Status_E-Ladepunkt`.
   * `operator` names the operator of a live station the register lacks.
   */
  liveStatus?: { provider: 'hamburg-sta'; url: string; operator: string };
}

/**
 * A city's recorded crime per small area (.context/crime-atlas.md).
 * `polizei-berlin`: the Kriminalitätsatlas XLSX of Polizei Berlin (CC BY-SA),
 * case counts and cases per 100,000 residents per Bezirksregion, the newest
 * year of the file; `outlines` names the Bezirksregion outline file in
 * packages/server/data/.
 */
export type CrimeAtlasSource = { provider: 'polizei-berlin'; xlsxUrl: string; outlines: string };

/** What a heat-relief place is: a cool place, a drinking fountain or a public toilet. */
export type HeatReliefKind = 'cool' | 'fountain' | 'toilet';

/**
 * One list of the heat-relief map layer, by the provider whose format it is in;
 * each provider has its own parser in packages/server/src/lib/heat-relief-parsers.ts
 * (.context/heat-relief.md) and gives one kind of place. `url` is the service
 * without query (the parser adds it).
 */
export type HeatReliefSource =
  /** Berlin's GDI WFS `kuehle_raeume` (Senatsverwaltung für Wissenschaft, Gesundheit und Pflege) */
  | { kind: 'cool'; provider: 'berlin-cool-rooms'; url: string }
  /** Berlin's GDI WFS `trinkwasserbrunnen` (Berliner Wasserbetriebe) */
  | { kind: 'fountain'; provider: 'berlin-fountains'; url: string }
  /** Berlin's GDI WFS `toiletten` */
  | { kind: 'toilet'; provider: 'berlin-toilets'; url: string }
  /** Hamburg's Geodienste WFS `de.hh.up:trinkwasserbrunnen` */
  | { kind: 'fountain'; provider: 'hamburg-fountains'; url: string }
  /** Köln's geoportal WFS `kuehle_orte_wfs`, one feature type per kind of cool place */
  | { kind: 'cool'; provider: 'koeln-cool-places'; url: string; layers: KoelnCoolLayer[] }
  /** Köln's geoportal WFS `trinkwasserbrunnen_wfs` (EPSG:25832 only) */
  | { kind: 'fountain'; provider: 'koeln-fountains'; url: string }
  /** AWB Köln's toilet list (XML) */
  | { kind: 'toilet'; provider: 'koeln-toilets'; url: string }
  /** München's GeodatenService WFS `baug_wfs:trinkwasserbrunnen` (Baureferat) */
  | { kind: 'fountain'; provider: 'muenchen-fountains'; url: string }
  /** München's GeodatenService WFS `gsm_wfs:wc_finder_opendata` (one row per toilet room) */
  | { kind: 'toilet'; provider: 'muenchen-toilets'; url: string };

/** The feature types of Köln's cool-places WFS: indoors, air-conditioned, by the water. */
export type KoelnCoolLayer = 'im_innenraum' | 'klimatisierter_ort' | 'am_wasser';

/**
 * The drought tile's sources (.context/soil-moisture.md): the DWD's daily soil
 * moisture per climate station (AMBAV model output, CC BY 4.0), and for Berlin
 * the street-tree waterings residents log on Gieß den Kiez (CC0).
 */
export interface SoilMoistureSource {
  provider: 'dwd';
  /**
   * DWD stations by their Stationsindex (as in the file name, without leading
   * zeros) and name. The tile shows their daily mean and each one's latest day.
   */
  stations: Array<{ id: string; name: string }>;
  /** Gieß den Kiez's open-data CSV of every logged watering (Technologiestiftung Berlin). */
  treeWatering?: { provider: 'giessdenkiez'; csvUrl: string };
}

/**
 * Street counts of citizen-run Telraam sensors as a project republishes them:
 * monthly hourly CSVs and a segment GeoJSON in one folder
 * (.context/telraam-counts.md).
 */
export type TelraamCountsSource = {
  provider: 'berlin-zaehlt';
  /** The folder holding `bzm_telraam_YYYY_MM.csv.gz` and `bzm_telraam_segments.geojson`, with a trailing slash. */
  baseUrl: string;
  /** The ISO 3166-2 code a segment's OSM address must carry ("DE-BE"): the files also cover the surrounding Land. */
  region: string;
};

/** The elections the political map can show the result of, by the body elected. */
export type ElectionKind = 'abgeordnetenhaus' | 'buergerschaft' | 'stadtrat';

/** The areas an election's result is mapped by. */
export type ElectionAreaLevel = 'wahlkreis' | 'stadtteil' | 'stadtbezirk';

/**
 * A city's latest election result per area, by the provider whose file it is
 * (parsers in packages/server/src/lib/election-parsers.ts,
 * .context/election-results.md). `outlines` names the area polygons in
 * packages/server/data/; `date` is election day (YYYY-MM-DD).
 */
export type ElectionResultSource = {
  /**
   * `berlin-agh-xlsx`: the Landeswahlleiterin's XLSX of the Abgeordnetenhaus
   * election per Wahlbezirk (second votes, summed per Wahlkreis);
   * `hamburg-stadtteile-xlsx`: Statistikamt Nord's Bürgerschaft result per
   * Stadtteil (Landesliste shares); `muenchen-stadtrat-zip`: the Wahlamt's
   * Stadtrat result per Stadtbezirk (CSV in a ZIP).
   */
  provider: 'berlin-agh-xlsx' | 'hamburg-stadtteile-xlsx' | 'muenchen-stadtrat-zip';
  url: string;
  election: ElectionKind;
  date: string;
  outlines: string;
};

export interface CityDataSources {
  weather: {
    provider: 'open-meteo' | 'brightsky';
    lat: number;
    lon: number;
    /**
     * The DWD warn region whose warnings are the city's, by its exact name in warnings.json
     * ("Stadt Köln"). Without it, every region whose name contains the city's `name` counts,
     * which suits a city-state but also takes in a Landkreis named after the city.
     */
    dwdWarnRegion?: string;
  };
  airQuality?: {
    sensorCommunityStations?: Array<{ sensorId: number; name: string; fallbackIds?: number[] }>;
    /**
     * Official measuring stations of the state networks, by their UBA station code
     * ("DEBE010"), read hourly from the Umweltbundesamt's Air Data API
     * (.context/air-quality-stations.md). A station without a recent reading is left out.
     */
    ubaStations?: string[];
  };
  transit?:
    | {
      /** transport.rest departures with disruption remarks, polled per station (VBB, Berlin). */
      provider: 'hafas';
      operatorId: string;
      endpoint?: string;
      stations?: Array<{ id: string; name: string }>;
    }
    | {
      /**
       * HVV's Geofox GTI `getAnnouncements` (Hamburg). Needs the GEOFOX_USER and
       * GEOFOX_PASSWORD credentials Hochbahn issues per operator; without them the
       * job skips the city. Default endpoint https://gti.geofox.de.
       */
      provider: 'geofox';
      endpoint?: string;
    };
  events?: EventSourceConfig[];
  police?: { provider: 'rss'; url: string; districts?: string[] };
  nina?: { ars: string }; // Amtlicher Regionalschlüssel for NINA warnings
  /**
   * Defibrillators from OpenStreetMap: the Overpass query takes the nodes inside the boundary
   * whose `name` is the city's and whose `admin_level` is this one. Without it, 4: a state,
   * which fits a city-state. A kreisfreie Stadt inside a state is 6 in German OSM.
   */
  aeds?: { adminLevel: number };
  roadworks?: RoadworksSource;
  bathing?: BathingSource;
  liftOutages?: LiftOutageSource;
  bikeSharing?: BikeSharingSource;
  parking?: ParkingSource;
  electricity?: ElectricitySource;
  citizenReports?: CitizenReportSource;
  trafficAccidents?: TrafficAccidentSource;
  crimeAtlas?: CrimeAtlasSource;
  trafficCounts?: TrafficCountSource;
  evCharging?: EvChargingSource;
  /** The heat-relief layer's lists, at most one per kind. */
  heatRelief?: HeatReliefSource[];
  soilMoisture?: SoilMoistureSource;
  telraamCounts?: TelraamCountsSource;
  /** The latest election's result per area, the political map's Election view. */
  electionResults?: ElectionResultSource;
  openData?: { provider: 'ckan'; baseUrl: string };
  waterLevels?: {
    provider: 'pegelonline';
    stations: Array<{ uuid: string; name: string; waterBody: string; tidal?: boolean }>;
  };
  /**
   * Water temperature at measuring points of a state's hydrological service, for the
   * water layer's temperature sub-layer (.context/water-levels.md, "Water Temperature").
   * `wasserportal`: Berlin's Wasserportal CSV export, one request per station. The
   * portal's CSV gives no coordinates, so each station carries its own (WGS 84).
   */
  waterTemperature?: {
    provider: 'wasserportal';
    stations: Array<{ id: string; name: string; waterBody: string; lat: number; lon: number }>;
  };
  /**
   * Flood class (Meldestufe or the state's equivalent) of state flood gauges from the
   * Länderübergreifendes Hochwasserportal (LHP) public API, for rivers PEGELONLINE lacks.
   * No water levels: the API gives none (.context/water-levels.md, "Flood Status").
   */
  floodStatus?: {
    provider: 'lhp';
    /** The LHP `states` filter the gauges and warnings are asked for with ("BY"). */
    state: string;
    /** LHP station ids ("BY_16005701"), in the order the tile lists them. */
    stations: Array<{ id: string; name: string; waterBody: string; upstream?: boolean }>;
  };
  budget?: {
    provider: 'berlin-doppelhaushalt';
    csvUrl: string;
  };
  appointments?: {
    provider: 'service-berlin';
    services: Array<{ id: string; name: string }>;
  };
  socialAtlas?: SocialAtlasSource;
  /** Residents per small area, for the population map layer and tile. */
  population?: PopulationSource;
  /**
   * Monthly unemployment key figures from the Bundesagentur für Arbeit's
   * Eckwertetabelle (packages/server/src/cron/ingest-labor-market.ts): the
   * Land's table for a city-state, the Kreis table for a kreisfreie Stadt.
   * `name` is the area's official name as the BA spells it ("Köln, Stadt").
   */
  laborMarket?: {
    provider: 'ba';
    scope: 'bundesland' | 'kreis';
    name: string;
  };
  /**
   * Weekly wastewater viral load (packages/server/src/cron/ingest-wastewater.ts).
   * `amelag` takes Influenza A, Influenza B, RSV and SARS-CoV-2 from the RKI
   * AMELAG treatment plants named in `sites` (their `standort`), weighted by the
   * population each serves. `lageso` takes the first three from LAGeSo's
   * Berlin CSV and only SARS-CoV-2 from the AMELAG `sites`.
   */
  wastewater?:
    | { provider: 'amelag'; sites: readonly string[] }
    | { provider: 'lageso'; csvUrl: string; sites: readonly string[] };
  /**
   * Weekly lab-confirmed influenza and RSV cases notified under the IfSG, from
   * the RKI's GitHub datasets (packages/server/src/cron/ingest-respiratory-cases.ts).
   * The data go down to the Bundesland only, so only a city-state has them:
   * `regionId` is the Land's two-digit key ("11" Berlin, "02" Hamburg).
   */
  respiratoryCases?: { provider: 'rki-ifsg'; regionId: string };
  pollen?: {
    provider: 'dwd';
    regionId: number;
    partregionId: number;
  };
  noiseSensors?: {
    provider: 'sensor-community';
    lat: number;
    lon: number;
    radius: number; // km
  };
  /**
   * Upcoming council meetings, from whichever of these adapters the city has
   * (packages/server/src/cron/ingest-council-meetings.ts). A meeting of the
   * city-wide body or one of its committees is `source: 'parliament'`; one of a
   * district body is `source: 'bvv'` with its `district`.
   */
  councilMeetings?: {
    /** Berlin: one ALLRIS OParl 1.0 server per district (BVV). */
    bvv?: Array<{ district: string; baseUrl: string }>;
    /** Berlin: the Abgeordnetenhaus PARDOK XML feeds. */
    parliament?: {
      committeeUrl: string;
      plenaryUrl: string;
    };
    /**
     * One OParl 1.1 body that holds the council, its committees and the
     * district councils together (Köln, SOMACOS SessionNet).
     */
    oparlBody?: {
      /** The body's meeting list (`…/bodies/<id>/meetings`). */
      meetingsUrl: string;
      /** The word that names a district council in a meeting's name ("Bezirksvertretung"); the words after it are the district. */
      districtBody: string;
      /** A meeting's web page is this prefix plus its OParl id's last segment, for a server whose meetings carry no `web`. */
      webUrlPrefix?: string;
    };
    /** München: the RIS RSS feeds of city council (Stadtrat) and district committee (BA) meetings. */
    muenchenRis?: {
      councilFeedUrl: string;
      districtFeedUrl: string;
    };
    /**
     * Hamburg: the Bürgerschaft website's event calendar (CoreMedia result
     * list, read as HTML), for its committee and plenary sessions.
     */
    hamburgBuergerschaft?: {
      /** The calendar's search action (`…/aktuelles/termine/<id>!search`). */
      calendarUrl: string;
    };
  };
}

// Weather data types (shared between server ingestion and web UI)

export interface CurrentWeather {
  temp: number;
  feelsLike: number;
  humidity: number;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
  uvIndex?: number;
  uvIndexClearSky?: number;
}

export interface HourlyForecast {
  time: string;
  temp: number;
  precipProb: number;
  weatherCode: number;
  uvIndex?: number;
}

export interface DailyForecast {
  date: string;
  high: number;
  low: number;
  weatherCode: number;
  precip: number;
  sunrise: string;
  sunset: string;
  uvIndexMax?: number;
  uvIndexClearSkyMax?: number;
}

export interface WeatherAlert {
  headline: string;
  severity: string;
  description: string;
  validUntil: string;
  /** 'heat' for DWD's heat warnings (levels 10 and 11); absent for the others and in data stored before 2026-11. */
  kind?: 'heat';
}

/**
 * DWD's heat outlook for the city's warn region (hwtrend_YYYYMMDD.json): one
 * status per day for 8 days from `issued`. 0 none, 1 warning of strong heat
 * stress, 2 warning of extreme heat stress (days 1–2 from the warnings), 3 heat
 * trend active, a warning possible (from day 3).
 */
export interface DwdHeatTrend {
  /** The file's day ("YYYY-MM-DD"), the first of `days`. */
  issued: string;
  days: number[];
}

/** DWD UV index forecast: the expected daily maximum for three days. */
export interface DwdUvForecast {
  today: number;
  tomorrow: number;
  dayAfter: number;
  /**
   * The date ("YYYY-MM-DD") that `today` refers to. DWD publishes once a day,
   * so before the morning update `today` still means the previous day.
   * Missing when DWD's file gave no date, and in data stored before it was added.
   */
  forecastDay?: string;
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  alerts: WeatherAlert[];
  dwdUv?: DwdUvForecast;
  dwdHeatTrend?: DwdHeatTrend;
}

// Political data
export interface Representative {
  name: string;
  party: string;
  role: string;
  photoUrl?: string;
  profileUrl?: string;
  constituency?: string;
}

export interface PoliticalDistrict {
  id: string;
  name: string;
  level: 'stadt' | 'bezirk' | 'bundestag' | 'landesparlament';
  representatives: Representative[];
}

// Election results (dataSources.electionResults)

/** A party's share of the valid votes, in percent. */
export interface ElectionShare {
  party: string;
  pct: number;
}

/** One area's result, or the city's (`ElectionResults.total`). */
export interface ElectionAreaResult {
  /** The outline's ID ("0101", "05"; a Hamburg Stadtteil group by its outlines' IDs joined with "+"). */
  id: string;
  /** As the source names it ("Mitte 1", "Billbrook/Rothenburgsort", "Altstadt-Lehel"). */
  name: string;
  /** Voters per 100 eligible; null where the source gives none. */
  turnout: number | null;
  /** The parties with at least 1 % city-wide, in the city's order (strongest first), each with its share here. */
  shares: ElectionShare[];
  /** Every other party's share together. */
  otherPct: number;
  /** The strongest party here (the shares' maximum), null if none has votes. */
  leader: string | null;
}

export interface ElectionResults {
  election: ElectionKind;
  /** Election day, YYYY-MM-DD. */
  date: string;
  areaLevel: ElectionAreaLevel;
  /** The city-wide result (`id` "total"), with the eligible and voters counts where the source has them. */
  total: ElectionAreaResult & { eligible: number | null; voters: number | null };
  areas: ElectionAreaResult[];
  /** The official file the result was read from. */
  sourceUrl: string;
}

/** The properties of an election map area: the result is looked up by `id` in `ElectionResults.areas`. */
export interface ElectionFeatureProps {
  id: string;
  name: string;
  leader: string | null;
  leaderPct: number | null;
}

/** One member's vote in a roll-call vote, as abgeordnetenwatch.de records it. */
export type VoteChoice = 'yes' | 'no' | 'abstain' | 'no_show';

export interface VoteCounts {
  yes: number;
  no: number;
  abstain: number;
  noShow: number;
}

/**
 * A roll-call vote (abgeordnetenwatch "poll") in the Bundestag or the city's
 * state parliament: the whole parliament's result and how the city's members
 * (the same ones as the political tile's member list) voted.
 */
export interface PoliticalVote {
  id: number;
  parliament: 'bundestag' | 'state';
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** Whether the motion was adopted; null when abgeordnetenwatch has no result. */
  accepted: boolean | null;
  topics: string[];
  url: string;
  totals: VoteCounts;
  city: VoteCounts;
  members: Array<{ name: string; party: string; vote: VoteChoice }>;
}

// Traffic incidents
export interface TrafficIncident {
  id: string;
  type: 'jam' | 'closure' | 'construction' | 'accident' | 'other';
  severity: 'low' | 'moderate' | 'major' | 'critical';
  description: string;
  road?: string | null;
  from?: string | null;
  to?: string | null;
  delay?: number | null;
  length?: number | null;
  geometry: { type: string; coordinates: number[][] };
  startTime?: string | null;
  endTime?: string | null;
}

// Emergency pharmacies
export interface EmergencyPharmacy {
  id: string;
  name: string;
  address: string;
  district?: string;
  phone?: string;
  location: { lat: number; lon: number };
  validFrom: string;
  validUntil: string;
  distance?: number;
}

// Air quality grid (WAQI stations + configured Sensor.Community sensors)
export interface AirQualityGridPoint {
  lat: number;
  lon: number;
  /**
   * Index value. Despite the name, WAQI points (url on aqicn.org) carry the
   * US EPA AQI as WAQI reports it; Sensor.Community points carry a European
   * AQI computed from PM. See .context/weather.md, "AQI scales on screen".
   */
  europeanAqi: number;
  station: string;
  /** Link to station detail page */
  url?: string;
}

// Official air quality stations (UBA Air Data API, state networks)
/** UBA air quality index class: 0 very good, 1 good, 2 moderate, 3 poor, 4 very poor. */
export type UbaAirIndex = 0 | 1 | 2 | 3 | 4;

export interface AirQualityStation {
  /** UBA station code, e.g. "DEBE010". */
  code: string;
  /** Station name as UBA gives it ("Berlin Wedding", "München/Stachus"). */
  name: string;
  lat: number;
  lon: number;
  /** UBA station type: Verkehr (traffic), Hintergrund (background) or Industrie (industrial). */
  setting: 'traffic' | 'background' | 'industrial';
  /** State network code from UBA ("BE", "HH", "NW", "BY"). */
  network: string;
  /** End of the latest measured hour, UTC ISO 8601. */
  measuredAt: string;
  /** Overall index of that hour, the worst of its components' indices. */
  index: UbaAirIndex | null;
  /** One-hour means of that hour in µg/m³, null when the station does not measure the component. */
  no2: number | null;
  pm10: number | null;
  pm25: number | null;
  o3: number | null;
}

// Construction / roadworks (VIZ Berlin, Hamburg, Köln, München; see RoadworksSource)
export interface ConstructionSite {
  id: string;
  subtype: 'construction' | 'closure' | 'disruption';
  street: string;
  section?: string;
  description: string;
  direction?: string;
  /** Feed date, shown as it is: German format from every provider ("01.03.2026" or "01.03.2026 06:00") */
  validFrom?: string;
  validUntil?: string;
  /**
   * 'permit' when validFrom/validUntil are the permit period, which the works
   * need not fill (Köln). Missing: the period of the works themselves.
   */
  validity?: 'permit';
  isFuture: boolean;
  geometry: { type: string; coordinates: number[] | number[][] | Array<{ type: string; coordinates: number[] | number[][] }> };
}

// AED / defibrillator locations (OpenStreetMap Overpass)
export interface AedLocation {
  id: string;
  lat: number;
  lon: number;
  indoor: boolean;
  description?: string;
  operator?: string;
  openingHours?: string;
  access?: string;
}

// Bathing water quality (LAGeSo Berlin)
export interface BathingSpot {
  id: string;
  name: string;
  district: string;
  waterBody: string;
  lat: number;
  lon: number;
  measuredAt: string;
  waterTemp: number | null;
  visibility: number | null;
  quality: 'good' | 'warning' | 'poor';
  algae: string | null;
  advisory: string | null;
  classification: string | null;
  detailUrl: string;
  inSeason: boolean;
}

// Water levels (PEGELONLINE)
export interface WaterLevelStation {
  uuid: string;
  name: string;
  waterBody: string;
  lat: number;
  lon: number;
  currentLevel: number;
  timestamp: string;
  state: 'low' | 'normal' | 'high' | 'very_high' | 'unknown';
  tidal: boolean;
  characteristicValues?: {
    shortname: string;
    value: number;
  }[];
}

export interface WaterLevelData {
  stations: WaterLevelStation[];
  fetchedAt: string;
}

// Water temperature (Berlin Wasserportal)
export interface WaterTemperatureStation {
  /** The provider's station number ("139"). */
  id: string;
  name: string;
  waterBody: string;
  lat: number;
  lon: number;
  /** The newest valid reading, °C. */
  temperature: number;
  /** When it was measured (ISO 8601 with offset). */
  measuredAt: string;
  /** The station's page on the provider's portal. */
  url: string;
}

export interface WaterTemperatureData {
  /** The configured stations with a reading of the last few days, in config order. */
  stations: WaterTemperatureStation[];
}

// Budget data (Berlin Doppelhaushalt)
export interface BudgetCategoryAmount {
  code: number;
  name: string;
  amount: number;
}

export interface BudgetAreaSummary {
  areaCode: number;
  areaName: string;
  revenues: BudgetCategoryAmount[];
  expenses: BudgetCategoryAmount[];
  totalRevenue: number;
  totalExpense: number;
}

export interface BudgetSummary {
  year: string;
  areas: BudgetAreaSummary[];
  fetchedAt: string;
}

// NINA civil protection warnings
export interface NinaWarning {
  id: string;
  version: number;
  startDate: string;
  expiresAt?: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  urgency?: string;
  type: string;
  source: 'mowas' | 'biwapp' | 'katwarn' | 'dwd' | 'lhp' | 'police';
  headline: string;
  description?: string;
  instruction?: string;
  area?: { type: string; geometry: unknown; properties?: unknown };
}

// Bürgeramt appointment availability (service.berlin.de)
export interface BuergeramtService {
  serviceId: string;
  name: string;
  earliestDate: string | null;
  availableDays: number;
  status: 'available' | 'scarce' | 'none' | 'unknown';
}

export interface BuergeramtData {
  services: BuergeramtService[];
  fetchedAt: string;
  bookingUrl: string;
}

// Social Atlas (dataSources.socialAtlas: Berlin MSS, Köln Datenkatalog, Hamburg Sozialmonitoring)
/**
 * One area of the social atlas. Each indicator is a percentage, or null where
 * the city's source lacks it (Köln has no child poverty) or leaves the area
 * out. What each indicator measures differs by city; the web app labels them
 * per city (packages/web/src/lib/social-atlas.ts).
 */
export interface SocialAtlasFeatureProps {
  plrId: string;             // the area's ID: Berlin Planungsraum, Köln Statistisches Quartier, Hamburg Statistisches Gebiet, München Stadtbezirk
  plrName: string;
  bezId: string;             // the district it lies in (Berlin: Bezirk number; Köln: Stadtbezirk; Hamburg: Bezirk; München: its own number)
  population: number;
  statusIndex: number | null;   // 1 (hoch) – 4 (sehr niedrig), where the source has a status index (Berlin MSS, Hamburg)
  statusLabel: string | null;   // "hoch" | "mittel" | "niedrig" | "sehr niedrig"
  unemployment: number | null;
  singleParent: number | null;
  welfare: number | null;
  childPoverty: number | null;
}

// Labor market (Bundesagentur für Arbeit monthly)
export interface LaborMarketSummary {
  unemploymentRate: number;       // Arbeitslosenquote (%)
  totalUnemployed: number;        // Arbeitslose insgesamt
  yoyChangeAbsolute: number;      // total unemployed YoY absolute change
  yoyChangePercent: number;       // total unemployed YoY percent change
  sgbIIRate: number;              // SGB II unemployment rate (%)
  sgbIICount: number;             // SGB II unemployed count
  sgbIIYoyAbsolute: number;       // SGB II YoY absolute change
  sgbIIYoyPercent: number;        // SGB II YoY percent change
  underemploymentRate: number;    // Unterbeschäftigungsquote (%)
  underemploymentCount: number;   // Unterbeschäftigung (ohne Kurzarbeit) count
  underemploymentYoyAbsolute: number; // underemployment YoY absolute change
  underemploymentYoyPercent: number;  // underemployment YoY percent change
  reportMonth: string;            // ISO month "2026-02"
}

// Wastewater monitoring (Lageso Berlin + AMELAG)
export interface WastewaterPathogen {
  name: string;
  value: number;           // avg gene copies/L across plants (latest week)
  previousValue: number;   // avg gene copies/L (previous week)
  trend: 'rising' | 'falling' | 'stable' | 'new' | 'gone';
  level: 'none' | 'low' | 'moderate' | 'high';
  history: number[];       // last 12 weeks, oldest first
  sampleDate?: string;     // per-pathogen date when it differs from summary sampleDate (AMELAG lag)
}

export interface WastewaterSummary {
  sampleDate: string;
  pathogens: WastewaterPathogen[];
  plantCount: number;
}

// Lab-confirmed influenza and RSV cases notified under the IfSG (RKI), shown in the wastewater tile
export interface RespiratoryCaseSeries {
  name: 'Influenza' | 'RSV';
  cases: number;            // notified cases in the latest Meldewoche
  incidence: number;        // cases per 100,000 residents in that week
  previousCases: number;    // the week before
  trend: 'rising' | 'falling' | 'stable' | 'new' | 'gone';
  history: number[];        // cases in the last 12 weeks, oldest first, 7 days apart
}

export interface RespiratoryCases {
  /** The latest Meldewoche in the RKI files, "2026-W43". */
  week: string;
  /** Monday of that week, "2026-10-19": the sparkline's end date. */
  weekStart: string;
  pathogens: RespiratoryCaseSeries[];
}

// Feuerwehr (Berlin Fire Department) monthly operations
export interface FeuerwehrMonthData {
  reportMonth: string;                      // "2026-02"
  missionCountAll: number;
  missionCountEms: number;
  missionCountFire: number;
  missionCountTechnicalRescue: number;
  responseTimeEmsCriticalMedian: number;    // seconds
  responseTimeFirePumpMedian: number;       // seconds
}

export interface FeuerwehrSummary {
  current: FeuerwehrMonthData;              // last complete month
  partial: FeuerwehrMonthData | null;       // current partial month (may be null early in month)
  previous: FeuerwehrMonthData | null;      // month before current, for MoM delta
}

// Population demographics (dataSources.population: Berlin half-yearly, Köln and Hamburg yearly)
export interface PopulationFeatureProps {
  plrId: string;         // the area's ID: Berlin 8-digit Planungsraum ("01100101"), Köln Statistisches Quartier, Hamburg Stadtteil
  plrName: string;       // its name (e.g. "Stülerstraße")
  population: number;    // total residents
  density: number;       // people per km²
  foreignPct: number;    // % non-German nationality
  elderlyPct: number;    // % aged 65+
  youthPct: number;      // % aged 0-17
}

export interface PopulationSummary {
  total: number;
  density: number;            // residents per km²
  foreignTotal: number;
  foreignPct: number;
  elderlyPct: number;
  youthPct: number;
  workingAgePct: number;    // % aged 18-64
  changeAbsolute: number;   // vs previous snapshot (0 if first)
  changePct: number;
  snapshotDate: string;     // "2025-12-31"
  /** What the change compares with: the previous half-year (Berlin, the default) or the previous year (Köln, Hamburg). */
  changePeriod?: 'half-year' | 'year';
}

// Noise sensors (Sensor.Community DNMS)
export interface NoiseSensor {
  id: number;
  lat: number;
  lon: number;
  laeq: number;   // Equivalent continuous sound level dB(A)
  laMin: number;   // Minimum sound level dB(A)
  laMax: number;   // Maximum sound level dB(A)
}

// Pollen forecast (DWD Pollenflug-Gefahrenindex)
export type PollenIntensity = '0' | '0-1' | '1' | '1-2' | '2' | '2-3' | '3' | '-1';

export type PollenType = 'Hasel' | 'Erle' | 'Esche' | 'Birke' | 'Graeser' | 'Roggen' | 'Beifuss' | 'Ambrosia';

export interface PollenTypeForecast {
  today: PollenIntensity;
  tomorrow: PollenIntensity;
  dayAfterTomorrow: PollenIntensity;
}

export interface PollenForecast {
  region: string;
  updatedAt: string;
  pollen: Record<PollenType, PollenTypeForecast>;
}

// Lift and escalator outages (KVB Köln)
export interface LiftOutage {
  /** The operator's id of the lift or escalator ("011-04": station 011, unit 04). */
  id: string;
  kind: 'lift' | 'escalator';
  /** The station as the operator names it ("Dom/HBf."). */
  station: string;
  /** The unit within the station ("Aufzug 04", "Fahrtreppe 51"). */
  unit: string;
  lat: number | null;
  lon: number | null;
  /** The operator's note on the outage, when it gives one. */
  info: string | null;
}

export interface LiftOutageData {
  /** Out of service now, lifts first, each kind by station. */
  outages: LiftOutage[];
  /** When the operator last updated its lists (ISO 8601 with offset), null when it gave no time. */
  updated: string | null;
}

// Bike sharing (nextbike GBFS, Hamburg StadtRAD)
export interface BikeStation {
  /** The operator's station id. */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Bikes available to rent now. */
  bikes: number;
  /** Free docks; null where the station has no fixed docks or the feed gives no capacity. */
  docks: number | null;
  /** When the station last reported (GBFS) or its count last changed (StadtRAD), Unix seconds. */
  reportedAt: number | null;
}

export interface BikeSharingData {
  /** The system as its operator brands it ("nextbike Berlin", "KVB-Rad", "StadtRAD Hamburg"). */
  system: string;
  operator: string;
  /** Stations inside the city's bounding box that are installed and renting. */
  stations: BikeStation[];
  /** When the feed was last updated (ISO 8601), null when it gave no time. */
  updated: string | null;
}

// Parking (Hamburg car-park WFS)
export interface ParkingFacility {
  /** The provider's id ("1012"). */
  id: string;
  name: string;
  /** Multi-storey car park, underground garage or surface car park. */
  kind: 'garage' | 'underground' | 'lot';
  lat: number;
  lon: number;
  /** Free spaces now. */
  free: number;
  /** Spaces in all, as the car park reports them with its free count. */
  total: number;
  /** `closed` and `fault` as the guidance system reports them; `free` then means little. */
  status: 'open' | 'closed' | 'fault';
  /**
   * Free spaces against about 10–30 minutes earlier, as the job saw them:
   * `filling` (fewer free), `emptying` (more free), `steady`; null until the job
   * has an earlier reading (after a restart) or when the car park did not report.
   */
  trend: 'filling' | 'emptying' | 'steady' | null;
  /** When the car park last reported (ISO 8601 with offset), null when unknown. */
  updated: string | null;
}

export interface ParkingData {
  /** Car parks with live occupancy, by name. */
  facilities: ParkingFacility[];
  /** The newest report among them (ISO 8601), null when none gave a time. */
  updated: string | null;
}

// Electricity (SMARD for the control area, Energy-Charts for Germany)
/** SMARD's generation series, grouped as the tile shows them. */
export type GenerationKind =
  | 'windOffshore' | 'windOnshore' | 'solar' | 'biomass' | 'hydro' | 'otherRenewable'
  | 'lignite' | 'hardCoal' | 'gas' | 'pumpedStorage' | 'otherConventional';

/**
 * Energy-Charts' traffic light: 2 green (high renewable share), 1 yellow
 * (average), 0 red (low renewable share), -1 red (grid congestion).
 */
export type GridSignal = -1 | 0 | 1 | 2;

/** The control area's generation in one quarter-hour (SMARD). */
export interface ElectricityMix {
  /** Start of the quarter-hour (ISO 8601, UTC). */
  at: string;
  /** Average output in that quarter-hour in MW, by kind; a kind the area does not report is left out. */
  mw: Partial<Record<GenerationKind, number>>;
  /** Renewable share of the area's generation in %, one decimal. */
  renewableShare: number;
}

/** One quarter-hour of Germany's grid (Energy-Charts). */
export interface GridPoint {
  /** Start of the quarter-hour (ISO 8601, UTC). */
  t: string;
  /** Germany's renewable share of load in %, measured or forecast. */
  share: number | null;
  signal: GridSignal | null;
  /** Measured CO₂ intensity of German generation, g/kWh; null until it is published. */
  co2: number | null;
  /** Energy-Charts' forecast of it, g/kWh. */
  co2Forecast: number | null;
}

export interface ElectricityData {
  controlArea: ControlArea;
  /** The newest quarter-hour every series of the area has reached, null when SMARD failed. */
  mix: ElectricityMix | null;
  /** The area's renewable share of generation per hour over the last 24 hours, oldest first. */
  renewableHistory: Array<{ t: string; share: number }>;
  /** Germany's grid by quarter-hour, today in German time and later quarter-hours once forecast; empty when Energy-Charts failed. */
  grid: GridPoint[];
}

// Soil moisture (DWD, per station) and street-tree watering (Gieß den Kiez)
/**
 * One day's soil moisture under grass, 0–60 cm, in % of usable field capacity
 * (% nFK, "plant-available water"; above 100 the soil holds more than it can
 * keep). `sandy` is DWD's BFGS_AG (loamy sand), `loamy` its BFGL_AG (loamy silt).
 */
export interface SoilMoistureDay {
  /** The day (YYYY-MM-DD). */
  date: string;
  sandy: number;
  loamy: number;
}

/** One station's newest day. */
export interface SoilMoistureStation extends SoilMoistureDay {
  /** DWD Stationsindex. */
  id: string;
  name: string;
}

/** Street-tree waterings in a period: total litres, logged waterings and distinct trees watered. */
export interface TreeWateringPeriod {
  litres: number;
  waterings: number;
  trees: number;
}

export interface TreeWateringSummary {
  /** The newest day with a logged watering (YYYY-MM-DD); the file is regenerated about monthly. */
  dataThrough: string;
  /** The 30 days up to and including `dataThrough`. */
  last30Days: TreeWateringPeriod;
  /** The calendar year of `dataThrough` so far. */
  season: TreeWateringPeriod & { year: number };
  /** The whole calendar year before, for comparison. */
  previousSeason: TreeWateringPeriod & { year: number };
  /** The Bezirke with the most litres this season, most first (at most 3). */
  topDistricts: Array<{ district: string; litres: number }>;
}

export interface SoilMoistureData {
  /** Each configured station's newest day; a station whose file failed is left out. */
  stations: SoilMoistureStation[];
  /** The stations' daily mean over the last 90 days, oldest first (one decimal). */
  history: SoilMoistureDay[];
  /** Gieß den Kiez waterings (Berlin); null for a city without them or when the CSV failed. */
  watering: TreeWateringSummary | null;
}

// Citizen issue reports (Open311 GeoReport v2)
export type CitizenReportStatus = 'open' | 'in_progress' | 'closed';

/** The map's coarse grouping of a portal's categories, for the marker icon. */
export type CitizenReportGroup = 'waste' | 'lighting' | 'traffic' | 'roads' | 'green' | 'vehicles' | 'graffiti' | 'other';

/**
 * One report, without anything that could name the person who made it: no
 * description, address, photo or official reply (.context/citizen-reports.md).
 */
export interface CitizenReport {
  /** The portal's service_request_id ("26227-2026"). */
  id: string;
  /** Rounded to four decimals (about 10 m). */
  lat: number;
  lon: number;
  /** The portal's category as it names it ("Wilder Müll"). */
  category: string;
  group: CitizenReportGroup;
  status: CitizenReportStatus;
  /** The portal's own name for the status ("In Bearbeitung", "Erledigt/Beauftragt"), when it gives one. */
  statusLabel: string | null;
  /** ISO 8601 with offset. */
  requestedAt: string;
  updatedAt: string | null;
  /** The request's page on the portal. */
  url: string | null;
}

export interface CitizenReportData {
  /** Newest first, at most the cap. */
  reports: CitizenReport[];
  /** How many days back the reports reach. */
  windowDays: number;
  /** Reports in the window before the cap. */
  total: number;
  /** Of `reports`, by status. */
  counts: Record<CitizenReportStatus, number>;
}

// Traffic accidents (Unfallatlas, Statistische Ämter des Bundes und der Länder)
/** The worst outcome of an accident: 1 someone killed, 2 seriously injured, 3 slightly injured (UKATEGORIE). */
export type AccidentSeverity = 1 | 2 | 3;

/**
 * One accident with personal injury, as a tuple to keep Berlin's ~13,000 small.
 * `kind` is the Unfallart (UART: 0 other, 1–9 collision kinds), `type` the
 * Unfalltyp (UTYP1: 1–7). `participants` is a bitmask of who was involved:
 * 1 bicycle, 2 car, 4 pedestrian, 8 motorcycle, 16 goods vehicle, 32 other
 * (bus, tram …); `ACCIDENT_PARTICIPANTS` in the server parser and the web layer.
 */
export type TrafficAccident = [
  lon: number,
  lat: number,
  severity: AccidentSeverity,
  /** 1–12 */
  month: number,
  /** 1 Sunday … 7 Saturday, as the Unfallatlas counts (UWOCHENTAG) */
  weekday: number,
  /** 0–23: the accident happened between this hour and the next */
  hour: number,
  kind: number,
  type: number,
  participants: number,
];

export interface TrafficAccidentData {
  /** The year the accidents happened in. */
  year: number;
  accidents: TrafficAccident[];
  /** When the statistical offices published the file (ISO 8601), null when the index gave no time. */
  published: string | null;
}

// Crime atlas (Kriminalitätsatlas Berlin, Polizei Berlin, CC BY-SA)
/**
 * The offence groups the crime map shows, each a column of the
 * Kriminalitätsatlas: all offences, assault (Körperverletzungen insgesamt),
 * robbery (Raub, street robbery included), domestic burglary
 * (Wohnraumeinbruch), bicycle theft and the police's "Kieztaten", offences
 * residents notice in their neighbourhood. The server's parser
 * (`CRIME_COLUMNS` in lib/crime-atlas.ts) and the web layer list them in this order.
 */
export type CrimeIndicator = 'total' | 'assault' | 'robbery' | 'burglary' | 'bikeTheft' | 'kiez';

/** Cases per 100,000 residents of each offence group (the atlas's Häufigkeitszahl), null where the atlas gives none. */
export type CrimeRates = Record<CrimeIndicator, number | null>;
/** Recorded cases of each offence group, null where the atlas gives none. */
export type CrimeCounts = { [K in CrimeIndicator as `${K}Count`]: number | null };

/** One Bezirksregion on the crime map: flat, so the map's expressions can read each rate. */
export type CrimeAreaProps = CrimeRates & CrimeCounts & {
  /** The 6-digit LOR key of the Bezirksregion ("011001") */
  areaId: string;
  name: string;
  /** Its Bezirk */
  district: string;
};

export interface CrimeAtlasData {
  /** The year the offences were recorded in (PKS year). */
  year: number;
  /** The city as a whole: its rates are the averages the map compares each area with. */
  city: CrimeRates & CrimeCounts;
  geojson: {
    type: 'FeatureCollection';
    features: Array<{ type: 'Feature'; geometry: unknown; properties: CrimeAreaProps }>;
  };
}

// Traffic counts (Hamburg infrared counters)
/**
 * One counting site (a junction or road section with several directional
 * counters) for one mode: the vehicles or bikes its counters counted in the
 * hour, and what they usually count in that hour of that weekday.
 */
export interface TrafficCountSite {
  /** `<mode>-<site>`: unique across both modes. */
  id: string;
  mode: TrafficCountMode;
  /** The operator's site number ("0248"). */
  site: string;
  /** The junction or road ("Poppenbütteler Chaussee / Specksaalredder"), null when the site list lacks it. */
  name: string | null;
  lat: number;
  lon: number;
  /** Start of the hour counted (ISO 8601, UTC). */
  hour: string;
  /** Vehicles or bikes counted in that hour, summed over the counters compared. */
  count: number;
  /**
   * The same counters' usual count: the median of the same local hour on the
   * same weekday in the four weeks before, summed. Null when no counter has two
   * such weeks.
   */
  typical: number | null;
  /** How many directional counters the numbers sum. */
  counters: number;
}

export interface TrafficCountData {
  sites: TrafficCountSite[];
  /** When the job read the counts (ISO 8601). */
  updated: string;
}

// EV charging (BNetzA Ladesäulenregister, Hamburg live status)
/** Plug types as the map names them; the register's and Hamburg's spellings are mapped onto these. */
export type EvPlug = 'type2' | 'ccs' | 'chademo' | 'schuko' | 'type1' | 'mcs';

/**
 * A charge point's live status, from OCPP's: `available`; `occupied` while a
 * car is plugged in (PREPARING, CHARGING, SUSPENDEDEV, SUSPENDEDEVSE,
 * FINISHING, RESERVED, OCCUPIED); `outOfOrder` (FAULTED, UNAVAILABLE);
 * `unknown` without a status or with UNKNOWN.
 */
export type EvPointStatus = 'available' | 'occupied' | 'outOfOrder' | 'unknown';

export interface EvLivePoint {
  /** The charge point's EVSE id ("DE*HHM*E1011*02"). */
  id: string;
  status: EvPointStatus;
  /** When the status was reported (it is written on change), Unix seconds; null without one. */
  since: number | null;
}

export interface EvChargingStation {
  /** The register's first Ladeeinrichtungs-ID at this place, or `live:<asset id>` for a station only the live feed has. */
  id: string;
  lat: number;
  lon: number;
  /** The operator's name on the BNetzA map (`Anzeigename (Karte)`), else its company name. */
  operator: string;
  /** Street and house number. */
  address: string;
  /** Charge points at this place (several charging devices of one operator at one spot are one station). */
  points: number;
  /** The highest rated power of a plug here, kW; null where unknown (stations only the live feed has). */
  maxKw: number | null;
  /** A fast charger (a Schnellladeeinrichtung, over 22 kW, or a DC plug). */
  fast: boolean;
  plugs: EvPlug[];
  /** Live status of the charge points, in cities with `dataSources.evCharging.liveStatus`. */
  live?: EvLivePoint[];
}

export interface EvChargingData {
  /** The register edition's date (YYYY-MM-DD, from its file name). */
  edition: string;
  stations: EvChargingStation[];
  /** When the live status was last fetched (ISO 8601); absent in a city without one. */
  liveUpdated?: string | null;
}

// Heat relief (cool places, drinking fountains, public toilets)
/**
 * One place of the heat-relief layer. Text fields are the source's German, as
 * given (trimmed, notes clipped); a field the source lacks is left out, to keep
 * Berlin's ~900 places compact.
 */
export interface HeatReliefPlace {
  kind: HeatReliefKind;
  lat: number;
  lon: number;
  /** Name or location; '' where the source has none (Köln's cool places: the popup names the kind). */
  name: string;
  address?: string;
  /** Opening hours as free text. */
  hours?: string;
  /** The source's remark: restrictions, a description, the toilet type. */
  note?: string;
  /** Köln's cool places: indoors, air-conditioned or by the water. */
  setting?: 'indoor' | 'air-conditioned' | 'water';
  /** Months the place runs, 1–12, where the source states them (Berlin's fountains: May to October). */
  season?: { from: number; to: number };
  /** The source says it is out of order now. */
  outOfOrder?: boolean;
  accessible?: 'yes' | 'partly' | 'no';
  /** Fee in euros, 0 when free. */
  fee?: number;
  changingTable?: boolean;
}

export interface HeatReliefData {
  places: HeatReliefPlace[];
}

// Street counts (Telraam sensors, Berlin zählt Mobilität)
/** A street's counts on one day, summed over its hours. */
export interface TelraamDayCounts {
  cars: number;
  bikes: number;
  pedestrians: number;
  /** Buses and lorries. */
  heavy: number;
}

/** One counted street segment on the day shown. */
export interface TelraamSegmentCount extends TelraamDayCounts {
  /** Telraam's segment id: its page is telraam.net/en/location/{id}. */
  id: number;
  /** A point halfway along the segment. */
  lon: number;
  lat: number;
  /** The street's OSM name, null where it has none. */
  street: string | null;
  /** The Ortsteil (or Bezirk) from the segment's OSM address. */
  district: string | null;
  /** Hours of the day the sensor was up at least half the time. Most sensors see only in daylight. */
  hours: number;
  /**
   * The median of the same weekday in the four weeks before, from at least two
   * such days. null when there were fewer, or when the day shown was counted
   * for clearly fewer hours than usual (an outage would read as a drop).
   */
  usual: (TelraamDayCounts & { days: number }) | null;
}

export interface TelraamCountsData {
  /** The local day counted (YYYY-MM-DD), normally yesterday. */
  date: string;
  segments: TelraamSegmentCount[];
}

// Flood status (LHP public API): flood classes at state gauges and regional flood warnings
/**
 * LHP's nationwide flood class at a gauge: 0 no flood, 1 minor … 4 very severe flood.
 * Each state maps its own levels onto it; in Bavaria class N is Meldestufe N.
 */
export type FloodClass = 0 | 1 | 2 | 3 | 4;

export interface FloodGauge {
  /** LHP station id, e.g. "BY_16005701" */
  id: string;
  name: string;
  waterBody: string;
  /** Upstream of the city, listed as an early sign. */
  upstream: boolean;
  /** null when LHP has no current data for the gauge (its class -1). */
  floodClass: FloodClass | null;
  /** The state's own label for the class, as LHP gives it ("Keine Meldestufe", "Meldestufe 2"). */
  stateLabel: string | null;
  /** When the gauge's class was determined (ISO 8601 with offset). */
  measuredAt: string | null;
  /** The state flood service's page for the gauge. */
  url: string | null;
}

export interface FloodAlert {
  id: string;
  headline: string;
  /** The warned region or river section ("Stadt München"). */
  area: string;
  /** LHP warning class: 1 all-clear, 2 pre-warning, 4 flood, 5 severe flood, 6 very severe flood. */
  level: number;
  /** LHP's name for the class ("Vorwarnung"). */
  levelName: string;
  url: string | null;
}

export interface FloodStatus {
  gauges: FloodGauge[];
  alerts: FloodAlert[];
  /** LHP's `updated` (the "Stand" its licence asks to show), ISO 8601 with offset. */
  updated: string;
}

// News feed items
export interface NewsItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  sourceName: string;
  sourceUrl: string;
  description?: string;
  category: string;
  tier: number;
  lang: string;
  location?: { lat: number; lon: number; label?: string };
  importance?: number;
}

export interface NewsDigest {
  items: NewsItem[];
  categories: Record<string, NewsItem[]>;
  updatedAt: string;
}

// City events (kulturdaten.berlin, Ticketmaster, go~mus, Stadt Köln open data)
export interface CityEvent {
  id: string;
  title: string;
  venue?: string;
  date: string;
  endDate?: string;
  category: 'music' | 'art' | 'theater' | 'food' | 'market' | 'sport' | 'community' | 'museum' | 'other';
  url: string;
  description?: string;
  free?: boolean;
  source: 'kulturdaten' | 'ticketmaster' | 'gomus' | 'stadt-koeln';
  price?: string;
}

// Safety / police reports
export interface SafetyReport {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  district?: string;
  location?: { lat: number; lon: number; label?: string };
}

// Transit alerts (VBB HAFAS)
export interface TransitAlert {
  id: string;
  line: string;
  lines: string[];
  type: 'delay' | 'disruption' | 'cancellation' | 'planned-work';
  severity: 'low' | 'medium' | 'high';
  message: string;
  detail: string;
  station: string;
  location: { lat: number; lon: number } | null;
  affectedStops: string[];
}

// Air quality (Open-Meteo)
export interface AirQuality {
  current: {
    europeanAqi: number;
    pm25: number;
    pm10: number;
    no2: number;
    o3: number;
    updatedAt: string;
  };
  hourly: Array<{
    time: string;
    europeanAqi: number;
    pm25: number;
    pm10: number;
  }>;
}

// Bootstrap response (all city data in one response)
export interface BootstrapData {
  news: ApiResponse<NewsDigest> | null;
  weather: ApiResponse<WeatherData> | null;
  transit: ApiResponse<TransitAlert[]> | null;
  events: ApiResponse<CityEvent[]> | null;
  safety: ApiResponse<SafetyReport[]> | null;
  nina: ApiResponse<NinaWarning[]> | null;
  airQuality: ApiResponse<AirQuality | null> | null;
  airQualityStations: ApiResponse<AirQualityStation[] | null> | null;
  pharmacies: ApiResponse<EmergencyPharmacy[]> | null;
  aeds: ApiResponse<AedLocation[]> | null;
  traffic: ApiResponse<TrafficIncident[]> | null;
  construction: ApiResponse<ConstructionSite[]> | null;
  waterLevels: ApiResponse<WaterLevelData> | null;
  floodStatus: ApiResponse<FloodStatus | null> | null;
  liftOutages: ApiResponse<LiftOutageData | null> | null;
  electricity: ApiResponse<ElectricityData | null> | null;
  soilMoisture: ApiResponse<SoilMoistureData | null> | null;
  budget: ApiResponse<BudgetSummary | null> | null;
  appointments: ApiResponse<BuergeramtData> | null;
  laborMarket: ApiResponse<LaborMarketSummary | null> | null;
  wastewater: ApiResponse<WastewaterSummary | null> | null;
  respiratoryCases: ApiResponse<RespiratoryCases | null> | null;
  populationSummary: ApiResponse<PopulationSummary | null> | null;
  feuerwehr: ApiResponse<FeuerwehrSummary | null> | null;
  pollen: ApiResponse<PollenForecast | null> | null;
  noiseSensors: ApiResponse<NoiseSensor[] | null> | null;
  councilMeetings: ApiResponse<CouncilMeeting[] | null> | null;
}

// News AI summary
export type NewsSummaryData = {
  briefing: string | null;
  generatedAt: string | null;
  headlineCount: number;
  cached: boolean;
  /**
   * Machine-readable AI marker for `briefing`: true whenever it holds text.
   * Metadata only, not a watermark, so it does not travel with copied text
   * (see .context/ai-transparency.md).
   */
  aiGenerated: boolean;
  /** Id of the model that wrote `briefing`, e.g. "gpt-6-luna"; null when there is none. */
  generator: string | null;
};

// Council meetings (BVV OParl + PARDOK)
export type { CouncilMeeting } from './schemas.js';
