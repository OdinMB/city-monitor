/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export type { WeatherData } from '@city-monitor/shared';
import type { WeatherData } from '@city-monitor/shared';

export interface BootstrapData {
  news: unknown | null;
  weather: WeatherData | null;
  transit: unknown | null;
  events: unknown | null;
  safety: unknown | null;
  nina: unknown | null;
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
}

export interface TransitAlert {
  id: string;
  line: string;
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
  category: 'music' | 'art' | 'theater' | 'food' | 'market' | 'sport' | 'community' | 'other';
  url: string;
  description?: string;
  free?: boolean;
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

export const api = {
  getBootstrap: (city: string) => fetchJson<BootstrapData>(`${BASE}/${city}/bootstrap`),
  getNewsDigest: (city: string) => fetchJson<NewsDigest>(`${BASE}/${city}/news/digest`),
  getNewsSummary: (city: string) => fetchJson<{ briefing: string | null; generatedAt: string | null; headlineCount: number; cached: boolean }>(`${BASE}/${city}/news/summary`),
  getWeather: (city: string) => fetchJson<WeatherData>(`${BASE}/${city}/weather`),
  getTransit: (city: string) => fetchJson<TransitAlert[]>(`${BASE}/${city}/transit`),
  getEvents: (city: string) => fetchJson<CityEvent[]>(`${BASE}/${city}/events`),
  getSafety: (city: string) => fetchJson<SafetyReport[]>(`${BASE}/${city}/safety`),
  getNina: (city: string) => fetchJson<NinaWarning[]>(`${BASE}/${city}/nina`),
  getAirQuality: (city: string) => fetchJson<AirQuality | null>(`${BASE}/${city}/air-quality`),
  getPharmacies: (city: string) => fetchJson<EmergencyPharmacy[]>(`${BASE}/${city}/pharmacies`),
  getTraffic: (city: string) => fetchJson<TrafficIncident[]>(`${BASE}/${city}/traffic`),
  getPolitical: (city: string, level: 'bundestag' | 'state') => fetchJson<PoliticalDistrict[]>(`${BASE}/${city}/political/${level}`),
};
