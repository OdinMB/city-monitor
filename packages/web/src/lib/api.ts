/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export type { WeatherData, ApiResponse } from '@city-monitor/shared';
import type { WeatherData, ApiResponse } from '@city-monitor/shared';

export interface BootstrapData {
  news: ApiResponse<NewsDigest> | null;
  weather: ApiResponse<WeatherData> | null;
  transit: ApiResponse<TransitAlert[]> | null;
  events: ApiResponse<CityEvent[]> | null;
  safety: ApiResponse<SafetyReport[]> | null;
  nina: ApiResponse<NinaWarning[]> | null;
  airQuality: ApiResponse<AirQuality | null> | null;
  pharmacies: ApiResponse<EmergencyPharmacy[]> | null;
  traffic: ApiResponse<TrafficIncident[]> | null;
  construction: ApiResponse<ConstructionSite[]> | null;
  waterLevels: ApiResponse<WaterLevelData> | null;
  budget: ApiResponse<BudgetSummary | null> | null;
  appointments: ApiResponse<BuergeramtData> | null;
  laborMarket: ApiResponse<LaborMarketSummary | null> | null;
  wastewater: ApiResponse<WastewaterSummary | null> | null;
}

export interface NewsDigest {
  items: NewsItem[];
  categories: Record<string, NewsItem[]>;
  updatedAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  sourceName: string;
  category: string;
  tier: number;
  description?: string;
  location?: { lat: number; lon: number; label?: string };
  importance?: number;
}

export interface TransitAlert {
  id: string;
  line: string;
  lines?: string[];
  type: 'delay' | 'disruption' | 'cancellation' | 'planned-work';
  severity: 'low' | 'medium' | 'high';
  message: string;
  detail: string;
  station: string;
  location: { lat: number; lon: number } | null;
  affectedStops: string[];
}

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

export interface SafetyReport {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  district?: string;
  location?: { lat: number; lon: number; label?: string };
}

export interface NinaWarning {
  id: string;
  version: number;
  startDate: string;
  expiresAt?: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  urgency?: string;
  type: string;
  source: string;
  headline: string;
  description?: string;
  instruction?: string;
  area?: { type: string; geometry: unknown; properties?: unknown };
}

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

export type { AirQualityGridPoint, ConstructionSite, WaterLevelData, WaterLevelStation, AedLocation, BathingSpot, BudgetSummary, BudgetAreaSummary, BudgetCategoryAmount, BuergeramtData, BuergeramtService, SocialAtlasFeatureProps, LaborMarketSummary, WastewaterSummary, WastewaterPathogen } from '@city-monitor/shared';
import type { AirQualityGridPoint, ConstructionSite, WaterLevelData, AedLocation, BathingSpot, BudgetSummary, BuergeramtData, LaborMarketSummary, WastewaterSummary } from '@city-monitor/shared';

export type NewsSummaryData = { briefing: string | null; generatedAt: string | null; headlineCount: number; cached: boolean };

export const api = {
  getBootstrap: (city: string) => fetchJson<BootstrapData>(`${BASE}/${city}/bootstrap`),
  getNewsDigest: (city: string) => fetchJson<ApiResponse<NewsDigest>>(`${BASE}/${city}/news/digest`),
  getNewsSummary: (city: string) => fetchJson<ApiResponse<NewsSummaryData>>(`${BASE}/${city}/news/summary`),
  getWeather: (city: string) => fetchJson<ApiResponse<WeatherData>>(`${BASE}/${city}/weather`),
  getTransit: (city: string) => fetchJson<ApiResponse<TransitAlert[]>>(`${BASE}/${city}/transit`),
  getEvents: (city: string) => fetchJson<ApiResponse<CityEvent[]>>(`${BASE}/${city}/events`),
  getSafety: (city: string) => fetchJson<ApiResponse<SafetyReport[]>>(`${BASE}/${city}/safety`),
  getNina: (city: string) => fetchJson<ApiResponse<NinaWarning[]>>(`${BASE}/${city}/nina`),
  getAirQuality: (city: string) => fetchJson<ApiResponse<AirQuality | null>>(`${BASE}/${city}/air-quality`),
  getAirQualityGrid: (city: string) => fetchJson<ApiResponse<AirQualityGridPoint[]>>(`${BASE}/${city}/air-quality/grid`),
  getPharmacies: (city: string) => fetchJson<ApiResponse<EmergencyPharmacy[]>>(`${BASE}/${city}/pharmacies`),
  getTraffic: (city: string) => fetchJson<ApiResponse<TrafficIncident[]>>(`${BASE}/${city}/traffic`),
  getConstruction: (city: string) => fetchJson<ApiResponse<ConstructionSite[]>>(`${BASE}/${city}/construction`),
  getAeds: (city: string) => fetchJson<ApiResponse<AedLocation[]>>(`${BASE}/${city}/aeds`),
  getBathing: (city: string) => fetchJson<ApiResponse<BathingSpot[]>>(`${BASE}/${city}/bathing`),
  getWaterLevels: (city: string) => fetchJson<ApiResponse<WaterLevelData>>(`${BASE}/${city}/water-levels`),
  getPolitical: (city: string, level: 'bundestag' | 'state' | 'bezirke' | 'state-bezirke') => fetchJson<ApiResponse<PoliticalDistrict[]>>(`${BASE}/${city}/political/${level}`),
  getBudget: (city: string) => fetchJson<ApiResponse<BudgetSummary | null>>(`${BASE}/${city}/budget`),
  getAppointments: (city: string) => fetchJson<ApiResponse<BuergeramtData>>(`${BASE}/${city}/appointments`),
  getSocialAtlas: (city: string) => fetchJson<ApiResponse<GeoJSON.FeatureCollection | null>>(`${BASE}/${city}/social-atlas`),
  getLaborMarket: (city: string) => fetchJson<ApiResponse<LaborMarketSummary | null>>(`${BASE}/${city}/labor-market`),
  getWastewater: (city: string) => fetchJson<ApiResponse<WastewaterSummary | null>>(`${BASE}/${city}/wastewater`),
};
