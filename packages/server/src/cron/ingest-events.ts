/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';

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

const EVENTS_TIMEOUT_MS = 15_000;
const EVENTS_PAGE_SIZE = 50;

interface KulturdatenEvent {
  identifier: string;
  status: string;
  schedule: {
    startDate: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
  };
  attractions?: Array<{
    referenceLabel?: { de?: string; en?: string };
  }>;
  locations?: Array<{
    referenceLabel?: { de?: string; en?: string };
  }>;
  admission?: {
    ticketType?: string;
  };
}

interface KulturdatenResponse {
  success: boolean;
  data: {
    page: number;
    pageSize: number;
    totalCount: number;
    events: KulturdatenEvent[];
  };
}

export function createEventsIngestion(cache: Cache) {
  return async function ingestEvents(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.events) continue;
      try {
        await ingestCityEvents(city.id, city.dataSources.events.url, cache);
      } catch (err) {
        console.error(`[ingest-events] ${city.id} failed:`, err);
      }
    }
  };
}

async function ingestCityEvents(cityId: string, sourceUrl: string, cache: Cache): Promise<void> {
  const startDate = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  const url = `${sourceUrl}?startDate=${startDate}&endDate=${endDate}&pageSize=${EVENTS_PAGE_SIZE}&page=1`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0', 'Accept': 'application/json' },
  });

  if (!response.ok) {
    console.warn(`[ingest-events] ${cityId}: API returned ${response.status}`);
    return;
  }

  const raw: KulturdatenResponse = await response.json();
  if (!raw.success || !raw.data?.events) {
    console.warn(`[ingest-events] ${cityId}: API returned unsuccessful response`);
    return;
  }

  const events: CityEvent[] = raw.data.events
    .filter((e) => e.status === 'event.published')
    .map((e) => transformKulturdatenEvent(e))
    .filter((e): e is CityEvent => e !== null);

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date));

  cache.set(`${cityId}:events:upcoming`, events, 21600);
  console.log(`[ingest-events] ${cityId}: ${events.length} events (next 7 days)`);
}

function transformKulturdatenEvent(raw: KulturdatenEvent): CityEvent | null {
  const title = raw.attractions?.[0]?.referenceLabel?.de
    || raw.attractions?.[0]?.referenceLabel?.en;
  if (!title) return null;

  const venue = raw.locations?.[0]?.referenceLabel?.de
    || raw.locations?.[0]?.referenceLabel?.en;

  const startTime = raw.schedule.startTime && raw.schedule.startTime !== '00:00:00'
    ? `T${raw.schedule.startTime}` : 'T00:00:00';
  const date = `${raw.schedule.startDate}${startTime}`;

  const endDate = raw.schedule.endDate && raw.schedule.endDate !== raw.schedule.startDate
    ? raw.schedule.endDate : undefined;

  const free = raw.admission?.ticketType === 'ticketType.freeOfCharge';

  return {
    id: raw.identifier,
    title,
    venue: venue || undefined,
    date,
    endDate,
    category: classifyEventTitle(title),
    url: `https://kulturdaten.berlin/events/${raw.identifier}`,
    free: free || undefined,
  };
}

function classifyEventTitle(title: string): CityEvent['category'] {
  const lower = title.toLowerCase();
  if (lower.includes('konzert') || lower.includes('concert') || lower.includes('musik') || lower.includes('music')) return 'music';
  if (lower.includes('ausstellung') || lower.includes('exhibition') || lower.includes('galerie') || lower.includes('gallery')) return 'art';
  if (lower.includes('theater') || lower.includes('theatre') || lower.includes('bühne') || lower.includes('aufführung')) return 'theater';
  if (lower.includes('markt') || lower.includes('market') || lower.includes('flohmarkt') || lower.includes('basar')) return 'market';
  if (lower.includes('food') || lower.includes('essen') || lower.includes('kulinarisch') || lower.includes('kochen')) return 'food';
  if (lower.includes('sport') || lower.includes('lauf') || lower.includes('turnier') || lower.includes('marathon')) return 'sport';
  if (lower.includes('workshop') || lower.includes('treff') || lower.includes('stammtisch') || lower.includes('verein')) return 'community';
  return 'other';
}
