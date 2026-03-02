/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { CityConfig } from '@city-monitor/shared';
import { saveTransitAlerts } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { hashString } from '../lib/hash.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ingest-transit');

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

const TRANSIT_TIMEOUT_MS = 15_000;
const DEFAULT_ENDPOINT = 'https://v6.vbb.transport.rest';
const STATION_DELAY_MS = 1_500;

interface VbbDeparture {
  line?: { name?: string; product?: string };
  stop?: { name?: string; location?: { latitude?: number; longitude?: number } };
  remarks?: Array<{ type?: string; summary?: string; text?: string }>;
}

interface VbbResponse {
  departures?: VbbDeparture[];
}

type TransitConfig = NonNullable<CityConfig['dataSources']['transit']>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTransitIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestTransit(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      const transit = city.dataSources.transit;
      if (!transit?.stations?.length) continue;
      try {
        await ingestCityTransit(city.id, transit, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityTransit(
  cityId: string,
  transit: TransitConfig,
  cache: Cache,
  db: Db | null,
): Promise<void> {
  const endpoint = transit.endpoint ?? DEFAULT_ENDPOINT;
  const stations = transit.stations ?? [];
  if (stations.length === 0) return;

  const allAlerts: TransitAlert[] = [];
  const seen = new Set<string>();
  let anySuccess = false;

  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];

    // Delay between stations to avoid overwhelming the API
    if (i > 0) await sleep(STATION_DELAY_MS);

    try {
      const url = `${endpoint}/stops/${station.id}/departures?duration=30&remarks=true&results=20`;
      const response = await log.fetch(url, {
        signal: AbortSignal.timeout(TRANSIT_TIMEOUT_MS),
        headers: { 'User-Agent': 'CityMonitor/1.0' },
      });

      if (!response.ok) continue;

      const data: VbbResponse = await response.json();
      if (!data.departures || data.departures.length === 0) continue;
      anySuccess = true;

      for (const dep of data.departures) {
        if (!dep.line?.name || !dep.remarks) continue;

        for (const remark of dep.remarks) {
          if (remark.type !== 'warning' || !remark.summary) continue;

          const dedupeKey = `${dep.line.name}:${remark.summary}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const stopName = dep.stop?.name ?? station.name;
          const stopLoc = dep.stop?.location;
          const detail = remark.text?.trim() || remark.summary;

          allAlerts.push({
            id: hashString(dedupeKey),
            line: dep.line.name,
            type: classifyDisruption(remark.summary),
            severity: classifySeverity(remark.summary),
            message: remark.summary,
            detail,
            station: stopName,
            location: stopLoc?.latitude && stopLoc?.longitude
              ? { lat: stopLoc.latitude, lon: stopLoc.longitude }
              : null,
            affectedStops: extractStops(remark.summary),
          });
        }
      }
    } catch (err) {
      log.warn(`station ${station.id} failed`);
    }
  }

  if (!anySuccess) {
    log.warn(`${cityId}: all stations failed, skipping cache update`);
    return;
  }

  cache.set(`${cityId}:transit:alerts`, allAlerts, 1200);

  if (db) {
    try {
      await saveTransitAlerts(db, cityId, allAlerts);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${allAlerts.length} alerts`);
}

function classifyDisruption(summary: string): TransitAlert['type'] {
  const lower = summary.toLowerCase();
  if (lower.includes('ausfall') || lower.includes('cancel')) return 'cancellation';
  if (lower.includes('bauarbeit') || lower.includes('planned') || lower.includes('sperrung')) return 'planned-work';
  if (lower.includes('verspätung') || lower.includes('delay')) return 'delay';
  return 'disruption';
}

function classifySeverity(summary: string): TransitAlert['severity'] {
  const lower = summary.toLowerCase();
  if (lower.includes('ausfall') || lower.includes('cancel') || lower.includes('sperrung')) return 'high';
  if (lower.includes('störung') || lower.includes('disruption')) return 'high';
  if (lower.includes('verspätung') || lower.includes('delay')) return 'medium';
  return 'low';
}

function extractStops(summary: string): string[] {
  // Pattern 1: "zwischen X und Y"
  const zwischen = summary.match(/zwischen\s+(.+?)\s+und\s+(.+?)(?:\.|$)/i);
  if (zwischen) {
    return [zwischen[1].trim(), zwischen[2].trim()].filter(Boolean);
  }
  // Pattern 2: "X – Y" or "X - Y" (em-dash or hyphen range)
  const dash = summary.match(/:\s*(.+?)\s+[–\-]\s+(.+?)(?:\.|,|$)/);
  if (dash) {
    return [dash[1].trim(), dash[2].trim()].filter(Boolean);
  }
  return [];
}
