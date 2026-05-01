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

export interface FeedConfig {
  name: string;
  url: string;
  tier: 1 | 2 | 3 | 4;
  type: 'wire' | 'gov' | 'mainstream' | 'tech' | 'other';
  lang: string;
  category?: string;
}

export interface CityMapLayer {
  id: string;
  type: 'geojson' | 'markers';
  source: string;
  style?: Record<string, unknown>;
}

export interface EventSourceConfig {
  source: 'kulturdaten' | 'ticketmaster' | 'gomus';
  url: string;
  lookaheadDays?: number; // Default: 14
}

export interface CityDataSources {
  weather: { provider: 'open-meteo' | 'brightsky'; lat: number; lon: number };
  airQuality?: {
    sensorCommunityStations?: Array<{ sensorId: number; name: string; fallbackIds?: number[] }>;
  };
  transit?: {
    provider: 'hafas';
    operatorId: string;
    endpoint?: string;
    stations?: Array<{ id: string; name: string }>;
  };
  events?: EventSourceConfig[];
  police?: { provider: 'rss'; url: string; districts?: string[] };
  nina?: { ars: string }; // Amtlicher Regionalschlüssel for NINA warnings
  roadworks?: { url: string };
  openData?: { provider: 'ckan'; baseUrl: string };
  waterLevels?: {
    provider: 'pegelonline';
    stations: Array<{ uuid: string; name: string; waterBody: string; tidal?: boolean }>;
  };
  budget?: {
    provider: 'berlin-doppelhaushalt';
    csvUrl: string;
  };
  appointments?: {
    provider: 'service-berlin';
    services: Array<{ id: string; name: string }>;
  };
  socialAtlas?: {
    provider: 'mss-wfs';
    wfsUrl: string;
  };
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
  councilMeetings?: {
    bvv: Array<{ district: string; baseUrl: string }>;
    parliament?: {
      committeeUrl: string;
      plenaryUrl: string;
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

export interface DwdUvForecast {
  today: number;
  tomorrow: number;
  dayAfter: number;
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
  level: 'bezirk' | 'bundestag' | 'landesparlament';
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

// Air quality grid (WAQI stations + Open-Meteo supplements)
export interface AirQualityGridPoint {
  lat: number;
  lon: number;
  europeanAqi: number;
  station: string;
  /** Link to station detail page */
  url?: string;
}

// Construction / roadworks (VIZ Berlin)
export interface ConstructionSite {
  id: string;
  subtype: 'construction' | 'closure' | 'disruption';
  street: string;
  section?: string;
  description: string;
  direction?: string;
  validFrom?: string;
  validUntil?: string;
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

// Social Atlas (MSS 2023)
export interface SocialAtlasFeatureProps {
  plrId: string;
  plrName: string;
  bezId: string;
  population: number;
  statusIndex: number;       // si_n: 1–4
  statusLabel: string;       // si_v: "hoch" | "mittel" | "niedrig" | "sehr niedrig"
  unemployment: number;      // s1: %
  singleParent: number;      // s2: %
  welfare: number;           // s3: %
  childPoverty: number;      // s4: %
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

// Population demographics (Amt für Statistik Berlin-Brandenburg, semi-annual)
export interface PopulationFeatureProps {
  plrId: string;         // 8-digit Planungsraum ID (e.g. "01100101")
  plrName: string;       // Planungsraum name (e.g. "Stülerstraße")
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

// City events (kulturdaten.berlin, Ticketmaster, go~mus)
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
  source: 'kulturdaten' | 'ticketmaster' | 'gomus';
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
export type NewsSummaryData = { briefing: string | null; generatedAt: string | null; headlineCount: number; cached: boolean };

// Council meetings (BVV OParl + PARDOK)
export type { CouncilMeeting } from './schemas.js';
