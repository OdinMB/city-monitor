/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Standard API response wrapper with freshness metadata */
export interface ApiResponse<T> {
  data: T;
  fetchedAt: string | null;
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
}

export interface CityDataSources {
  weather: { provider: 'open-meteo'; lat: number; lon: number };
  airQuality?: {
    sensorCommunityStations?: Array<{ sensorId: number; name: string }>;
  };
  transit?: {
    provider: 'hafas';
    operatorId: string;
    endpoint?: string;
    stations?: Array<{ id: string; name: string }>;
  };
  events?: EventSourceConfig[];
  police?: { provider: 'rss'; url: string };
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
}

export interface HourlyForecast {
  time: string;
  temp: number;
  precipProb: number;
  weatherCode: number;
}

export interface DailyForecast {
  date: string;
  high: number;
  low: number;
  weatherCode: number;
  precip: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherAlert {
  headline: string;
  severity: string;
  description: string;
  validUntil: string;
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  alerts: WeatherAlert[];
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
  road?: string;
  from?: string;
  to?: string;
  delay?: number;
  length?: number;
  geometry: { type: string; coordinates: number[][] };
  startTime?: string;
  endTime?: string;
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

// Wastewater monitoring (Lageso Berlin)
export interface WastewaterPathogen {
  name: string;
  value: number;           // avg gene copies/L across plants (latest week)
  previousValue: number;   // avg gene copies/L (previous week)
  trend: 'rising' | 'falling' | 'stable' | 'new' | 'gone';
  level: 'none' | 'low' | 'moderate' | 'high';
  history: number[];       // last 12 weeks, oldest first
}

export interface WastewaterSummary {
  sampleDate: string;
  pathogens: WastewaterPathogen[];
  plantCount: number;
}
