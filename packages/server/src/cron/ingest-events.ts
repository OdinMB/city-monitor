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

async function ingestCityEvents(cityId: string, _sourceUrl: string, _cache: Cache): Promise<void> {
  // TODO: Implement events ingestion when a suitable Berlin events API/RSS is identified.
  console.warn(`[ingest-events] ${cityId}: source configured but ingestion not yet implemented`);
}
