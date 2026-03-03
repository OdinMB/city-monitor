/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { NinaWarning } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveNinaWarnings } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-nina');

const NINA_BASE = 'https://warnung.bund.de/api31';
const NINA_TIMEOUT_MS = 10_000;

interface DashboardWarning {
  id: string;
  version: number;
  startDate: string;
  expiresDate?: string;
  severity: string;
  type: string;
  i18nTitle: { de: string };
  transKeys?: { event?: string };
}

interface WarningDetail {
  info?: Array<{
    headline?: string;
    description?: string;
    instruction?: string;
    urgency?: string;
    event?: string;
  }>;
}

export function createNinaIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestNina(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (city.country !== 'DE' || !city.dataSources.nina) continue;
      try {
        await ingestCityNina(city.id, city.dataSources.nina.ars, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityNina(cityId: string, ars: string, cache: Cache, db: Db | null): Promise<void> {
  // Fetch dashboard warnings
  const dashboardUrl = `${NINA_BASE}/dashboard/${ars}.json`;
  const response = await log.fetch(dashboardUrl, {
    signal: AbortSignal.timeout(NINA_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) {
    log.warn(`${cityId} NINA dashboard returned ${response.status}`);
    return;
  }

  const rawWarnings: DashboardWarning[] = await response.json();

  // Filter out DWD warnings (already handled by ingest-weather.ts)
  const nonDwdWarnings = rawWarnings.filter((w) => !isDwdSource(w));

  const warnings: NinaWarning[] = [];

  for (const raw of nonDwdWarnings) {
    const warning = parseDashboardWarning(raw);
    if (!warning) continue;

    // Fetch full detail for description + instructions
    try {
      const detail = await fetchWarningDetail(raw.id);
      if (detail) {
        warning.description = detail.description;
        warning.instruction = detail.instruction;
        if (detail.urgency) warning.urgency = detail.urgency;
      }
    } catch {
      // Detail fetch is optional — continue with headline-only
    }

    // Fetch GeoJSON area
    try {
      const area = await fetchWarningGeoJSON(raw.id);
      if (area) warning.area = area;
    } catch {
      // GeoJSON is optional
    }

    warnings.push(warning);
  }

  // Sort by severity (extreme first), then start date
  const severityOrder: Record<string, number> = { extreme: 0, severe: 1, moderate: 2, minor: 3 };
  warnings.sort((a, b) => {
    const sa = severityOrder[a.severity] ?? 4;
    const sb = severityOrder[b.severity] ?? 4;
    if (sa !== sb) return sa - sb;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  cache.set(CK.ninaWarnings(cityId), warnings, 600);

  if (db && warnings.length > 0) {
    try {
      await saveNinaWarnings(db, cityId, warnings);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${warnings.length} NINA warnings (${rawWarnings.length - nonDwdWarnings.length} DWD skipped)`);
}

function isDwdSource(warning: DashboardWarning): boolean {
  return warning.id?.startsWith('dwd.') ||
    warning.type?.toLowerCase().includes('dwd') ||
    warning.transKeys?.event?.startsWith('BBK-EVC-0') === false && warning.id?.includes('.dwd.') === true;
}

function parseDashboardWarning(raw: DashboardWarning): NinaWarning | null {
  try {
    const headline = raw.i18nTitle?.de;
    if (!headline) return null;

    const source = detectSource(raw.id);
    const severity = mapSeverity(raw.severity);

    return {
      id: raw.id,
      version: raw.version ?? 1,
      startDate: raw.startDate ?? new Date().toISOString(),
      expiresAt: raw.expiresDate,
      severity,
      type: raw.type ?? 'unknown',
      source,
      headline,
    };
  } catch {
    return null;
  }
}

function detectSource(id: string): NinaWarning['source'] {
  if (id.startsWith('mow.')) return 'mowas';
  if (id.startsWith('biwapp.')) return 'biwapp';
  if (id.startsWith('katwarn.')) return 'katwarn';
  if (id.startsWith('dwd.')) return 'dwd';
  if (id.startsWith('lhp.')) return 'lhp';
  if (id.startsWith('police.')) return 'police';
  return 'mowas'; // default
}

function mapSeverity(raw: string): NinaWarning['severity'] {
  const lower = raw?.toLowerCase() ?? '';
  if (lower.includes('extreme')) return 'extreme';
  if (lower.includes('severe')) return 'severe';
  if (lower.includes('moderate')) return 'moderate';
  return 'minor';
}

async function fetchWarningDetail(id: string): Promise<{ description?: string; instruction?: string; urgency?: string } | null> {
  const url = `${NINA_BASE}/warnings/${id}.json`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });
  if (!response.ok) return null;

  const data: WarningDetail = await response.json();
  const info = data.info?.[0];
  if (!info) return null;

  return {
    description: info.description,
    instruction: info.instruction,
    urgency: info.urgency,
  };
}

async function fetchWarningGeoJSON(id: string): Promise<NinaWarning['area'] | null> {
  const url = `${NINA_BASE}/warnings/${id}.geojson`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });
  if (!response.ok) return null;

  const geojson = await response.json();
  if (geojson?.type === 'Feature' || geojson?.type === 'FeatureCollection') {
    return geojson;
  }
  return null;
}
