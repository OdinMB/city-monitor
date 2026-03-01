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
}

export const api = {
  getBootstrap: (city: string) => fetchJson<BootstrapData>(`${BASE}/${city}/bootstrap`),
  getNewsDigest: (city: string) => fetchJson<NewsDigest>(`${BASE}/${city}/news/digest`),
  getNewsSummary: (city: string) => fetchJson<{ briefing: string; generatedAt: string }>(`${BASE}/${city}/news/summary`),
  getWeather: (city: string) => fetchJson<WeatherData>(`${BASE}/${city}/weather`),
  getTransit: (city: string) => fetchJson<unknown[]>(`${BASE}/${city}/transit`),
  getEvents: (city: string) => fetchJson<unknown[]>(`${BASE}/${city}/events`),
};
