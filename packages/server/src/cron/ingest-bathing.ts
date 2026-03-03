/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { BathingSpot } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveBathingSpots } from '../db/writes.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

export type { BathingSpot };

const log = createLogger('ingest-bathing');

const FETCH_TIMEOUT_MS = 15_000;
const BATHING_TTL_SECONDS = 86400; // 24 hours
const CSV_URL = 'https://data.lageso.de/baden/0_letzte/letzte.csv';

function parseGermanDate(dateStr: string): string {
  const [day, month, year] = dateStr.split('.');
  if (!day || !month || !year) return dateStr;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseNumeric(value: string): number | null {
  if (!value || value === 'NA') return null;
  const cleaned = value.replace(/^[<>]\s*/, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function toQuality(farbId: string): BathingSpot['quality'] {
  const id = parseInt(farbId, 10);
  if (id === 1 || id === 11) return 'good';
  if (id === 3 || id === 13) return 'warning';
  return 'poor';
}

function toNullableText(value: string): string | null {
  if (!value || value === 'keine' || value === 'NA') return null;
  return value;
}

function isBathingSeason(): boolean {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  return (month === 5 && day >= 15) || (month > 5 && month < 9) || (month === 9 && day <= 15);
}

function parseCsv(text: string): BathingSpot[] {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const inSeason = isBathingSeason();
  const spots: BathingSpot[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(';');
    if (fields.length < 32) continue;

    const lat = parseFloat(fields[4]);
    const lon = parseFloat(fields[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const bsl = fields[13]; // BSL station code

    spots.push({
      id: `bath-${bsl}`,
      name: fields[0],
      district: fields[1],
      waterBody: fields[2],
      lat,
      lon,
      measuredAt: parseGermanDate(fields[8]),
      waterTemp: parseNumeric(fields[17]),
      visibility: parseNumeric(fields[9]),
      quality: toQuality(fields[20]),
      algae: toNullableText(fields[21]),
      advisory: toNullableText(fields[22]),
      classification: toNullableText(fields[31]) ?? null,
      detailUrl: fields[7],
      inSeason,
    });
  }

  return spots;
}

export function createBathingIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestBathing(): Promise<void> {
    try {
      const response = await log.fetch(CSV_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        log.warn(`LAGeSo CSV returned ${response.status}`);
        return;
      }

      const text = await response.text();
      const spots = parseCsv(text);

      cache.set(CK.bathingSpots('berlin'), spots, BATHING_TTL_SECONDS);

      if (db) {
        try {
          await saveBathingSpots(db, 'berlin', spots);
        } catch (err) {
          log.error('DB write failed', err);
        }
      }

      log.info(`berlin: ${spots.length} bathing spots updated`);
    } catch (err) {
      log.error('berlin bathing ingestion failed', err);
    }
  };
}
