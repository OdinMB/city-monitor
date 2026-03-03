/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { CityConfig, TrafficIncident } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveTrafficIncidents } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ingest-traffic');

export type { TrafficIncident };

const TRAFFIC_TIMEOUT_MS = 15_000;
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY ?? '';

/**
 * TomTom iconCategory → incident type mapping.
 * See: https://developer.tomtom.com/traffic-api/documentation/tomtom-maps/traffic-incidents/incident-details
 */
const ICON_TO_TYPE: Record<number, TrafficIncident['type']> = {
  0: 'other',      // Unknown
  1: 'accident',   // Accident
  2: 'other',      // Fog
  3: 'other',      // Dangerous Conditions
  4: 'other',      // Rain
  5: 'other',      // Ice
  6: 'jam',        // Jam
  7: 'closure',    // Lane Closed
  8: 'closure',    // Road Closed
  9: 'construction', // Road Works
  10: 'other',     // Wind
  11: 'other',     // Flooding
  12: 'other',     // Detour
  13: 'other',     // Cluster (multiple)
  14: 'other',     // Broken Down Vehicle
};

/** magnitudeOfDelay → severity */
function toSeverity(magnitude: number): TrafficIncident['severity'] {
  switch (magnitude) {
    case 4: return 'critical';
    case 3: return 'major';
    case 2: return 'moderate';
    default: return 'low';
  }
}

export function createTrafficIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestTraffic(): Promise<void> {
    if (!TOMTOM_API_KEY) {
      log.info('skipped — TOMTOM_API_KEY not set');
      return;
    }

    const cities = getActiveCities();
    for (const city of cities) {
      try {
        await ingestCityTraffic(city, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

interface TomTomIncident {
  type: string;
  geometry: { type: string; coordinates: number[] | number[][] };
  properties: {
    id: string;
    iconCategory: number;
    magnitudeOfDelay: number;
    events?: Array<{ description: string; code: number }>;
    from?: string;
    to?: string;
    delay?: number;
    length?: number;
    roadNumbers?: string[];
    startTime?: string;
    endTime?: string;
  };
}

async function ingestCityTraffic(city: CityConfig, cache: Cache, db: Db | null): Promise<void> {
  const { south, west, north, east } = city.boundingBox;
  const bbox = `${west},${south},${east},${north}`;

  const fields = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},from,to,delay,length,roadNumbers,startTime,endTime}}}';
  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails`
    + `?key=${TOMTOM_API_KEY}`
    + `&bbox=${bbox}`
    + `&fields=${encodeURIComponent(fields)}`
    + `&language=en-GB`
    + `&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11,14`
    + `&timeValidityFilter=present`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(TRAFFIC_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) {
    log.warn(`${city.id}: TomTom returned ${response.status}`);
    return;
  }

  const data = await response.json() as { incidents?: TomTomIncident[] };
  const raw = data?.incidents ?? [];

  const incidents: TrafficIncident[] = raw.map((i): TrafficIncident => {
    const props = i.properties;
    const desc = props.events?.map((e) => e.description).join('; ') ?? '';
    const coords = i.geometry.type === 'Point'
      ? [i.geometry.coordinates as number[]]
      : (i.geometry.coordinates as number[][]);

    return {
      id: props.id,
      type: ICON_TO_TYPE[props.iconCategory] ?? 'other',
      severity: toSeverity(props.magnitudeOfDelay),
      description: desc,
      road: props.roadNumbers?.join(', '),
      from: props.from,
      to: props.to,
      delay: props.delay,
      length: props.length,
      geometry: { type: 'LineString', coordinates: coords },
      startTime: props.startTime,
      endTime: props.endTime,
    };
  });

  cache.set(`${city.id}:traffic:incidents`, incidents, 300);

  if (db) {
    try {
      await saveTrafficIncidents(db, city.id, incidents);
    } catch (err) {
      log.error(`${city.id} DB write failed`, err);
    }
  }

  log.info(`${city.id}: ${incidents.length} traffic incidents updated`);
}
