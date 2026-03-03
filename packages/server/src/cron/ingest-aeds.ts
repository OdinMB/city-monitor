/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AedLocation } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveAeds } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ingest-aeds');

export type { AedLocation };

const FETCH_TIMEOUT_MS = 30_000;
const AED_TTL_SECONDS = 86400; // 24 hours

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

interface OverpassNode {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassNode[];
  remark?: string;
}

function buildOverpassQuery(cityName: string): string {
  return `[out:json][timeout:25];area["name"="${cityName}"]["admin_level"="4"]["boundary"="administrative"]->.s;node["emergency"="defibrillator"](area.s);out body;`;
}

export function createAedIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestAeds(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (city.country !== 'DE') continue;
      try {
        await ingestCityAeds(city.id, city.name, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityAeds(cityId: string, cityName: string, cache: Cache, db: Db | null): Promise<void> {
  const query = buildOverpassQuery(cityName);

  const response = await log.fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'CityMonitor/1.0',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    log.warn(`${cityId}: Overpass API returned ${response.status}`);
    return;
  }

  const data = await response.json() as OverpassResponse;

  if (data.remark && /runtime error|timed out/i.test(data.remark)) {
    log.warn(`${cityId}: Overpass query error — ${data.remark}`);
    return;
  }

  const elements = data?.elements ?? [];

  const aeds: AedLocation[] = [];
  for (const el of elements) {
    if (el.lat == null || el.lon == null) continue;
    const tags = el.tags ?? {};

    aeds.push({
      id: `aed-${el.id}`,
      lat: el.lat,
      lon: el.lon,
      indoor: tags.indoor === 'yes',
      description: tags['defibrillator:location'] || undefined,
      operator: tags.operator || undefined,
      openingHours: tags.opening_hours || undefined,
      access: tags.access || undefined,
    });
  }

  cache.set(`${cityId}:aed:locations`, aeds, AED_TTL_SECONDS);

  if (db) {
    try {
      await saveAeds(db, cityId, aeds);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${aeds.length} AED locations updated`);
}
