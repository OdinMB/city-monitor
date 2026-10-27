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

/**
 * A dashboard entry, in either of two shapes: the map-data endpoints' fields
 * at the top level, or the published API description's, which keeps `id`,
 * `i18nTitle` and the send time `sent` at the top level and puts headline,
 * severity and msgType under `payload.data` and the version under `payload`.
 * `entryFields` reads both.
 */
export interface DashboardWarning {
  id: string;
  version?: number;
  startDate?: string;
  sent?: string;
  expiresDate?: string;
  severity?: string;
  type?: string;
  i18nTitle?: { de?: string };
  transKeys?: { event?: string };
  payload?: {
    version?: number;
    type?: string;
    data?: { headline?: string; severity?: string; msgType?: string };
  };
}

/**
 * The fields read from a dashboard entry: the top-level value where there is
 * one, else its counterpart in the API description's shape. The map-data
 * `type` is CAP's message type, so it falls back to `msgType`, not to the
 * payload kind `payload.type`.
 */
function entryFields(raw: DashboardWarning) {
  const data = raw.payload?.data;
  return {
    headline: raw.i18nTitle?.de ?? data?.headline,
    version: raw.version ?? raw.payload?.version,
    startDate: raw.startDate ?? raw.sent,
    severity: raw.severity ?? data?.severity,
    type: raw.type ?? data?.msgType,
    msgType: data?.msgType,
  };
}

interface WarningDetail {
  msgType?: string;
  info?: Array<{
    headline?: string;
    description?: string;
    instruction?: string;
    urgency?: string;
    event?: string;
    expires?: string;
  }>;
}

/** CAP's msgType for a message that withdraws an earlier warning. */
function isCancel(msgType: string | undefined): boolean {
  return msgType?.toLowerCase() === 'cancel';
}

/**
 * Whether a warning is over at `now`: withdrawn (its type is CAP's Cancel)
 * or past its own expiry. One without an expiry, or with one that is not a
 * date, lasts until NINA stops listing it.
 */
export function hasEnded(warning: Pick<NinaWarning, 'type' | 'expiresAt'>, now: number = Date.now()): boolean {
  if (isCancel(warning.type)) return true;
  const expires = warning.expiresAt ? Date.parse(warning.expiresAt) : NaN;
  return expires <= now;
}

/** The warnings that have not ended at `now`, for serving a stored or cached list. */
export function currentWarnings(warnings: NinaWarning[], now: number = Date.now()): NinaWarning[] {
  return warnings.filter((warning) => !hasEnded(warning, now));
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
  const now = Date.now();

  for (const raw of nonDwdWarnings) {
    const warning = parseDashboardWarning(raw);
    // NINA can go on listing a warning after it was withdrawn or expired
    if (!warning || hasEnded(warning, now) || isCancel(entryFields(raw).msgType)) continue;

    // Fetch full detail for description + instructions, and the expiry if the entry has none
    try {
      const detail = await fetchWarningDetail(raw.id);
      if (detail) {
        if (isCancel(detail.msgType)) continue;
        warning.description = detail.description;
        warning.instruction = detail.instruction;
        if (detail.urgency) warning.urgency = detail.urgency;
        if (!warning.expiresAt && detail.expires) warning.expiresAt = detail.expires;
      }
    } catch {
      // Detail fetch is optional — continue with headline-only
    }
    if (hasEnded(warning, now)) continue;

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

  // Stored even when empty: the newest row is what the last successful run
  // found, so a cache miss or a restart cannot bring back a cleared warning.
  // A failed request returns or throws above and stores nothing.
  if (db) {
    try {
      await saveNinaWarnings(db, cityId, warnings);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${warnings.length} NINA warnings (${rawWarnings.length - nonDwdWarnings.length} DWD skipped)`);
}

export function isDwdSource(warning: DashboardWarning): boolean {
  return (warning.id?.startsWith('dwd.') ?? false) ||
    (warning.type?.toLowerCase().includes('dwd') ?? false);
}

export function parseDashboardWarning(raw: DashboardWarning): NinaWarning | null {
  try {
    const fields = entryFields(raw);
    const headline = fields.headline;
    if (!headline) return null;

    const source = detectSource(raw.id);
    const severity = mapSeverity(fields.severity);

    return {
      id: raw.id,
      version: fields.version ?? 1,
      startDate: fields.startDate ?? new Date().toISOString(),
      expiresAt: raw.expiresDate,
      severity,
      type: fields.type ?? 'unknown',
      source,
      headline,
    };
  } catch {
    return null;
  }
}

export function detectSource(id: string): NinaWarning['source'] {
  if (id.startsWith('mow.')) return 'mowas';
  if (id.startsWith('biwapp.')) return 'biwapp';
  if (id.startsWith('katwarn.')) return 'katwarn';
  if (id.startsWith('dwd.')) return 'dwd';
  if (id.startsWith('lhp.')) return 'lhp';
  if (id.startsWith('police.')) return 'police';
  return 'mowas'; // default
}

export function mapSeverity(raw: string | undefined): NinaWarning['severity'] {
  const lower = raw?.toLowerCase() ?? '';
  if (lower.includes('extreme')) return 'extreme';
  if (lower.includes('severe')) return 'severe';
  if (lower.includes('moderate')) return 'moderate';
  return 'minor';
}

async function fetchWarningDetail(id: string): Promise<{ msgType?: string; description?: string; instruction?: string; urgency?: string; expires?: string } | null> {
  const url = `${NINA_BASE}/warnings/${id}.json`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });
  if (!response.ok) return null;

  const data: WarningDetail = await response.json();
  const info = data.info?.[0];

  return {
    msgType: data.msgType,
    description: info?.description,
    instruction: info?.instruction,
    urgency: info?.urgency,
    expires: typeof info?.expires === 'string' ? info.expires : undefined,
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
