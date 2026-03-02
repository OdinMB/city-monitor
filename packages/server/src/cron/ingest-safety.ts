/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Cache } from '../lib/cache.js';
import { parseFeed } from '../lib/rss-parser.js';
import { hashString } from '../lib/hash.js';
import { getActiveCities } from '../config/index.js';

export interface SafetyReport {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  district?: string;
}

const SAFETY_TIMEOUT_MS = 10_000;

const BERLIN_DISTRICTS = [
  'Mitte', 'Friedrichshain', 'Kreuzberg', 'Pankow', 'Prenzlauer Berg',
  'Charlottenburg', 'Wilmersdorf', 'Spandau', 'Steglitz', 'Zehlendorf',
  'Tempelhof', 'Schöneberg', 'Neukölln', 'Treptow', 'Köpenick',
  'Marzahn', 'Hellersdorf', 'Lichtenberg', 'Reinickendorf', 'Wedding',
  'Moabit', 'Tiergarten',
];

export function createSafetyIngestion(cache: Cache) {
  return async function ingestSafety(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.police) continue;
      try {
        await ingestCitySafety(city.id, city.dataSources.police.url, cache);
      } catch (err) {
        console.error(`[ingest-safety] ${city.id} failed:`, err);
      }
    }
  };
}

async function ingestCitySafety(cityId: string, feedUrl: string, cache: Cache): Promise<void> {
  const response = await fetch(feedUrl, {
    signal: AbortSignal.timeout(SAFETY_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) {
    console.warn(`[ingest-safety] ${cityId}: feed returned ${response.status}`);
    return;
  }

  const xml = await response.text();
  const items = parseFeed(xml);

  const reports: SafetyReport[] = items.map((item) => ({
    id: hashString(item.url + item.title),
    title: item.title,
    description: item.description || '',
    publishedAt: item.publishedAt,
    url: item.url,
    district: extractDistrict(item.title),
  }));

  // Sort by most recent first
  reports.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  cache.set(`${cityId}:safety:recent`, reports, 900);
  console.log(`[ingest-safety] ${cityId}: ${reports.length} reports`);
}

function extractDistrict(title: string): string | undefined {
  for (const district of BERLIN_DISTRICTS) {
    if (title.includes(district)) return district;
  }
  return undefined;
}
