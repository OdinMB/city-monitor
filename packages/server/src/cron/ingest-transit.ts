/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';
import { hashString } from '../lib/hash.js';

export interface TransitAlert {
  id: string;
  line: string;
  type: 'delay' | 'disruption' | 'cancellation' | 'planned-work';
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedStops: string[];
}

const TRANSIT_TIMEOUT_MS = 15_000;

// Major Berlin stations to poll for disruption remarks
const BERLIN_STATIONS = [
  '900100003', // Alexanderplatz
  '900003201', // Hauptbahnhof
  '900120005', // Zoologischer Garten
];

interface VbbDeparture {
  line?: { name?: string; product?: string };
  remarks?: Array<{ type?: string; summary?: string; text?: string }>;
}

interface VbbResponse {
  departures?: VbbDeparture[];
}

export function createTransitIngestion(cache: Cache) {
  return async function ingestTransit(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.transit) continue;
      try {
        await ingestCityTransit(city.id, cache);
      } catch (err) {
        console.error(`[ingest-transit] ${city.id} failed:`, err);
      }
    }
  };
}

async function ingestCityTransit(cityId: string, cache: Cache): Promise<void> {
  const allAlerts: TransitAlert[] = [];
  const seen = new Set<string>();
  let anySuccess = false;

  for (const stationId of BERLIN_STATIONS) {
    try {
      const url = `https://v6.vbb.transport.rest/stops/${stationId}/departures?duration=30&remarks=true&results=50`;
      const response = await fetch(url, {
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

          allAlerts.push({
            id: hashString(dedupeKey),
            line: dep.line.name,
            type: classifyDisruption(remark.summary),
            severity: classifySeverity(remark.summary),
            message: remark.summary,
            affectedStops: extractStops(remark.summary),
          });
        }
      }
    } catch (err) {
      console.warn(`[ingest-transit] station ${stationId} failed:`, err);
    }
  }

  if (!anySuccess) {
    console.warn(`[ingest-transit] ${cityId}: all stations failed, skipping cache update`);
    return;
  }

  cache.set(`${cityId}:transit:alerts`, allAlerts, 300);
  console.log(`[ingest-transit] ${cityId}: ${allAlerts.length} alerts`);
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
  // Extract stop names from patterns like "zwischen X und Y"
  const match = summary.match(/zwischen\s+(.+?)\s+und\s+(.+?)(?:\.|$)/i);
  if (match) {
    return [match[1].trim(), match[2].trim()].filter(Boolean);
  }
  return [];
}

