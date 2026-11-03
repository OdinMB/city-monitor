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
  | 'noiseSensors'
  | 'councilMeetings'
  | 'bathing'         // dataSources.bathing: bathing-water quality (LAGeSo Berlin, Hamburg WFS)
  | 'liftOutages'     // dataSources.liftOutages: lift and escalator outages (KVB Köln)
  | 'bikeSharing'     // dataSources.bikeSharing: bike-sharing stations on the map (nextbike GBFS, StadtRAD)
  | 'evCharging'      // dataSources.evCharging: public charging stations on the map (BNetzA Ladesäulenregister)
  | 'evChargingLive'  // dataSources.evCharging.liveStatus: their charge points' live status (Hamburg)
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
  evCharging?: EvChargingSource;
  openData?: { provider: 'ckan'; baseUrl: string };
  waterLevels?: {
    provider: 'pegelonline';
    stations: Array<{ uuid: string; name: string; waterBody: string; tidal?: boolean }>;
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
  pharmacies: ApiResponse<EmergencyPharmacy[]> | null;
  aeds: ApiResponse<AedLocation[]> | null;
  traffic: ApiResponse<TrafficIncident[]> | null;
  construction: ApiResponse<ConstructionSite[]> | null;
  waterLevels: ApiResponse<WaterLevelData> | null;
  floodStatus: ApiResponse<FloodStatus | null> | null;
  liftOutages: ApiResponse<LiftOutageData | null> | null;
  budget: ApiResponse<BudgetSummary | null> | null;
  appointments: ApiResponse<BuergeramtData> | null;
  laborMarket: ApiResponse<LaborMarketSummary | null> | null;
  wastewater: ApiResponse<WastewaterSummary | null> | null;
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
