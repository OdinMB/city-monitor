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

export const api = {
  getBootstrap: (city: string) => fetchJson<BootstrapData>(`${BASE}/${city}/bootstrap`),
  getNewsDigest: (city: string) => fetchJson<NewsDigest>(`${BASE}/${city}/news/digest`),
  getNewsSummary: (city: string) => fetchJson<{ briefing: string | null; generatedAt: string | null; headlineCount: number; cached: boolean }>(`${BASE}/${city}/news/summary`),
  getWeather: (city: string) => fetchJson<WeatherData>(`${BASE}/${city}/weather`),
  getTransit: (city: string) => fetchJson<TransitAlert[]>(`${BASE}/${city}/transit`),
  getEvents: (city: string) => fetchJson<CityEvent[]>(`${BASE}/${city}/events`),
  getSafety: (city: string) => fetchJson<SafetyReport[]>(`${BASE}/${city}/safety`),
};
