/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { EventSourceConfig } from '@city-monitor/shared';
import { saveEvents } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-events');

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

const EVENTS_TIMEOUT_MS = 15_000;
const EVENTS_PAGE_SIZE = 50;
const MAX_PAGES = 3;
const MAX_FUTURE_EVENTS = 200;

// ---------------------------------------------------------------------------
// Kulturdaten.berlin types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Ticketmaster types
// ---------------------------------------------------------------------------

interface TicketmasterEvent {
  id: string;
  name: string;
  url: string;
  dates: {
    start: { localDate: string; localTime?: string };
  };
  classifications?: Array<{
    segment?: { name: string };
  }>;
  priceRanges?: Array<{
    min: number;
    max: number;
    currency: string;
  }>;
  _embedded?: {
    venues?: Array<{ name: string }>;
  };
}

interface TicketmasterResponse {
  _embedded?: {
    events: TicketmasterEvent[];
  };
}

// ---------------------------------------------------------------------------
// go~mus types
// ---------------------------------------------------------------------------

interface GomusEvent {
  id: number;
  title: string;
  sub_title?: string;
  description?: string;
  entry_fee: boolean;
  upcoming_bookings_start_times?: string[];
  location?: {
    address?: string;
    name?: string;
  };
}

interface GomusResponse {
  events: GomusEvent[];
}

// ---------------------------------------------------------------------------
// Main ingestion
// ---------------------------------------------------------------------------

export function createEventsIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestEvents(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.events || city.dataSources.events.length === 0) continue;
      try {
        await ingestCityEvents(city.id, city.name, city.country, city.dataSources.events, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityEvents(
  cityId: string,
  cityName: string,
  country: string,
  sources: EventSourceConfig[],
  cache: Cache,
  db: Db | null,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const allEvents: CityEvent[] = [];

  for (const config of sources) {
    try {
      let fetched: CityEvent[] = [];

      switch (config.source) {
        case 'kulturdaten':
          fetched = await fetchKulturdaten(config.url, cityId);
          break;
        case 'ticketmaster':
          fetched = await fetchTicketmaster(config.url, cityId, cityName, country);
          break;
        case 'gomus':
          fetched = await fetchGomus(config.url);
          break;
      }

      // Filter to future events only
      fetched = fetched.filter((e) => e.date >= nowIso);

      // Per-source DB write
      if (db && fetched.length > 0) {
        try {
          await saveEvents(db, cityId, config.source, fetched);
        } catch (err) {
          log.error(`${cityId}/${config.source} DB write failed`, err);
        }
      }

      allEvents.push(...fetched);
      if (fetched.length > 0) {
        log.info(`${cityId}/${config.source}: ${fetched.length} events`);
      }
    } catch (err) {
      log.error(`${cityId}/${config.source} fetch failed`, err);
    }
  }

  // Merge, sort, cap, cache
  const merged = allEvents
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_FUTURE_EVENTS);

  if (merged.length > 0) {
    cache.set(CK.eventsUpcoming(cityId), merged, 21600);
  }

  log.info(`${cityId}: ${merged.length} total events from ${sources.length} source(s)`);
}

// ---------------------------------------------------------------------------
// Kulturdaten.berlin fetcher
// ---------------------------------------------------------------------------

async function fetchKulturdaten(sourceUrl: string, _cityId: string): Promise<CityEvent[]> {
  const startDate = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  const allRaw: KulturdatenEvent[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${sourceUrl}?startDate=${startDate}&endDate=${endDate}&pageSize=${EVENTS_PAGE_SIZE}&page=${page}`;

    const response = await log.fetch(url, {
      signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
      headers: { 'User-Agent': 'CityMonitor/1.0', 'Accept': 'application/json' },
    });

    if (!response.ok) break;

    const raw: KulturdatenResponse = await response.json();
    if (!raw.success || !raw.data?.events) break;

    allRaw.push(...raw.data.events);

    if (raw.data.events.length < EVENTS_PAGE_SIZE) break;
  }

  return allRaw
    .filter((e) => e.status === 'event.published')
    .map((e) => transformKulturdatenEvent(e))
    .filter((e): e is CityEvent => e !== null);
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
    url: '',
    free: free || undefined,
    source: 'kulturdaten',
  };
}

// ---------------------------------------------------------------------------
// Ticketmaster fetcher
// ---------------------------------------------------------------------------

async function fetchTicketmaster(baseUrl: string, _cityId: string, cityName: string, country: string): Promise<CityEvent[]> {
  const apiKey = process.env.TICKETMASTER_CONSUMER_KEY;
  if (!apiKey) return [];

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const url = `${baseUrl}?apikey=${apiKey}&countryCode=${country}&city=${encodeURIComponent(cityName)}&startDateTime=${now}&size=100&sort=date,asc`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) return [];

  const raw: TicketmasterResponse = await response.json();
  if (!raw._embedded?.events) return [];

  return raw._embedded.events.map((e) => transformTicketmasterEvent(e)).filter((e): e is CityEvent => e !== null);
}

function transformTicketmasterEvent(raw: TicketmasterEvent): CityEvent | null {
  if (!raw.name || !raw.dates?.start?.localDate) return null;

  const time = raw.dates.start.localTime || '00:00:00';
  const date = `${raw.dates.start.localDate}T${time}`;
  const venue = raw._embedded?.venues?.[0]?.name;
  const segmentName = raw.classifications?.[0]?.segment?.name ?? '';

  let category: CityEvent['category'] = 'other';
  if (/music/i.test(segmentName)) category = 'music';
  else if (/sport/i.test(segmentName)) category = 'sport';
  else if (/arts.*theatre/i.test(segmentName)) category = 'theater';

  let price: string | undefined;
  let free = false;
  if (raw.priceRanges?.[0]) {
    const pr = raw.priceRanges[0];
    if (pr.min === 0 && pr.max === 0) {
      free = true;
    } else {
      price = pr.min === pr.max
        ? `${pr.min} ${pr.currency}`
        : `${pr.min}–${pr.max} ${pr.currency}`;
    }
  }

  return {
    id: raw.id,
    title: raw.name,
    venue: venue || undefined,
    date,
    category,
    url: raw.url || '',
    free: free || undefined,
    source: 'ticketmaster',
    price,
  };
}

// ---------------------------------------------------------------------------
// go~mus fetcher (Berlin state museums)
// ---------------------------------------------------------------------------

async function fetchGomus(baseUrl: string): Promise<CityEvent[]> {
  const url = `${baseUrl}?per_page=100&page=1&locale=de&by_bookable=true`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0', 'Accept': 'application/json' },
  });

  if (!response.ok) return [];

  const raw: GomusResponse = await response.json();
  if (!raw.events) return [];

  const now = new Date().toISOString();

  return raw.events
    .map((e) => transformGomusEvent(e, now))
    .filter((e): e is CityEvent => e !== null);
}

function transformGomusEvent(raw: GomusEvent, now: string): CityEvent | null {
  // Find first future booking time
  const futureTime = raw.upcoming_bookings_start_times?.find((t) => t >= now);
  if (!futureTime) return null;

  const title = raw.sub_title ? `${raw.title} – ${raw.sub_title}` : raw.title;
  if (!title) return null;

  const venue = raw.location?.name || raw.location?.address || undefined;

  // Classify: music/film → music, workshops → community, default → museum
  const lower = title.toLowerCase();
  let category: CityEvent['category'] = 'museum';
  if (/bühne|musik|film|konzert/i.test(lower)) category = 'music';
  else if (/workshop|kurs|führung/i.test(lower)) category = 'community';

  const description = raw.description
    ? raw.description.replace(/<[^>]*>/g, '').slice(0, 500)
    : undefined;

  return {
    id: `gomus-${raw.id}`,
    title,
    venue,
    date: futureTime,
    category,
    url: '',
    free: !raw.entry_fee || undefined,
    source: 'gomus',
    description,
  };
}

// ---------------------------------------------------------------------------
// Shared classifier
// ---------------------------------------------------------------------------

function classifyEventTitle(title: string): CityEvent['category'] {
  const lower = title.toLowerCase();
  if (lower.includes('konzert') || lower.includes('concert') || lower.includes('musik') || lower.includes('music')) return 'music';
  if (lower.includes('ausstellung') || lower.includes('exhibition') || lower.includes('galerie') || lower.includes('gallery')) return 'art';
  if (lower.includes('theater') || lower.includes('theatre') || lower.includes('bühne') || lower.includes('aufführung')) return 'theater';
  if (lower.includes('markt') || lower.includes('market') || lower.includes('flohmarkt') || lower.includes('basar')) return 'market';
  if (lower.includes('food') || lower.includes('essen') || lower.includes('kulinarisch') || lower.includes('kochen')) return 'food';
  if (lower.includes('sport') || lower.includes('lauf') || lower.includes('turnier') || lower.includes('marathon')) return 'sport';
  if (lower.includes('workshop') || lower.includes('treff') || lower.includes('stammtisch') || lower.includes('verein')) return 'community';
  if (lower.includes('museum') || lower.includes('ausstellungshalle')) return 'museum';
  return 'other';
}
