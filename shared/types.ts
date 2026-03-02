/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

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

export interface CityDataSources {
  weather: { provider: 'open-meteo'; lat: number; lon: number };
  transit?: {
    provider: 'hafas';
    operatorId: string;
    endpoint?: string;
    stations?: Array<{ id: string; name: string }>;
  };
  events?: { provider: 'rss' | 'api'; url: string };
  police?: { provider: 'rss'; url: string };
  nina?: { ars: string }; // Amtlicher Regionalschlüssel for NINA warnings
  openData?: { provider: 'ckan'; baseUrl: string };
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
