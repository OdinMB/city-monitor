/**
 * Car parks with live free spaces, per city from `dataSources.parking`. Today
 * Hamburg: the Urban Data Platform's car-park WFS, fed every 5 minutes by the
 * city's Parkleitsystem, dl-de/by-2.0 (Transparenzportal "Parkhäuser Hamburg",
 * Behörde für Verkehr und Mobilitätswende). Of its ~127 car parks only those
 * reporting free spaces (~45) are kept. See .context/parking.md.
 */
import type { CityConfig, ParkingData, ParkingFacility, ParkingSource } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveParking } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { berlinUtcOffset } from './ingest-council-meetings.js';

const log = createLogger('ingest-parking');

const FETCH_TIMEOUT_MS = 20_000;
/** Two job runs (every 5 min): a missed run keeps the counts, a second lets them lapse to the DB fallback. */
export const PARKING_TTL_SECONDS = 600;
/**
 * Postgres gets a row at most this often per city: it only serves cache
 * warming and the route's fallback, which refuses rows older than 30 minutes.
 */
export const PARKING_DB_INTERVAL_MS = 15 * 60_000;
/** The trend compares with the oldest reading at least this old ... */
const TREND_MIN_AGE_MS = 10 * 60_000;
/** ... and forgets readings older than this. */
const TREND_MAX_AGE_MS = 30 * 60_000;

/** The WFS request for every car park, as GeoJSON in WGS 84. */
export function hamburgParkingUrl(base: string): string {
  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    typeNames: 'de.hh.up:parkhaeuser',
    outputFormat: 'application/geo+json',
    srsName: 'EPSG:4326',
  });
  return `${base}?${params}`;
}

/** "03.11.2026, 03:03" (German local time) as ISO 8601 with its offset; null for anything else. */
export function parseReceived(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  const local = `${yyyy}-${mm}-${dd} ${hh}:${min}:00`;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00${berlinUtcOffset(local)}`;
}

/** `art`, compared in lower case (the WFS has "Parkhaus" and "parkhaus"); anything else, such as "Straßenrand", is a lot. */
const KINDS: Record<string, ParkingFacility['kind']> = { parkhaus: 'garage', tiefgarage: 'underground', parkplatz: 'lot' };
const STATUSES: Record<string, ParkingFacility['status']> = { frei: 'open', geschlossen: 'closed', 'Störung': 'fault' };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The car parks of the WFS answer that report free spaces, by name; null when
 * the body is not a GeoJSON feature collection. Trends are left null here.
 */
export function parseHamburgParking(json: unknown): ParkingData | null {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;
  const facilities: ParkingFacility[] = [];
  for (const f of features as Array<{ id?: unknown; geometry?: { type?: unknown; coordinates?: unknown }; properties?: Record<string, unknown> }>) {
    const p = f.properties ?? {};
    const free = num(p.frei);
    const total = num(p.gesamt);
    if (free === null || total === null) continue; // "keine Auslastungsdaten"
    const coords = f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates as unknown[] : [];
    const lon = num(coords[0]);
    const lat = num(coords[1]);
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    const id = typeof f.id === 'string' ? f.id.replace(/^.*_/, '') : '';
    if (lat === null || lon === null || !name || !id) continue;
    const status = (typeof p.status === 'string' ? STATUSES[p.status] : undefined) ?? 'open';
    facilities.push({
      id,
      name,
      kind: (typeof p.art === 'string' ? KINDS[p.art.trim().toLowerCase()] : undefined) ?? 'lot',
      lat,
      lon,
      free: Math.max(0, Math.min(free, total)),
      total: Math.max(0, total),
      // A car park reporting no spaces at all is shut, whatever its status says
      status: total <= 0 ? 'closed' : status,
      trend: null,
      updated: parseReceived(p.received),
    });
  }
  facilities.sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id));
  const updated = facilities.map((f) => f.updated).filter((u): u is string => u !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null;
  return { facilities, updated };
}

/** A car park's free count as the job saw it at a time. */
type Reading = { at: number; free: number };

/**
 * The trend of a car park from its readings, oldest first: against the oldest
 * reading at least TREND_MIN_AGE_MS old, a change of at least 3 spaces or 2 % of
 * the car park, whichever is more, is filling or emptying; less is steady.
 */
export function parkingTrend(free: number, total: number, readings: readonly Reading[], now: number): ParkingFacility['trend'] {
  const earlier = readings.find((r) => now - r.at >= TREND_MIN_AGE_MS && now - r.at <= TREND_MAX_AGE_MS);
  if (!earlier) return null;
  const delta = free - earlier.free;
  const threshold = Math.max(3, Math.round(total * 0.02));
  if (delta <= -threshold) return 'filling';
  if (delta >= threshold) return 'emptying';
  return 'steady';
}

async function fetchCity(city: CityConfig, source: ParkingSource): Promise<ParkingData | null> {
  switch (source.provider) {
    case 'hamburg-wfs': {
      const res = await log.fetch(hamburgParkingUrl(source.url), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)', Accept: 'application/geo+json, application/json' },
      });
      if (!res.ok) {
        log.warn(`${city.id}: car-park WFS returned ${res.status}`);
        return null;
      }
      const parsed = parseHamburgParking(await res.json());
      if (!parsed) log.warn(`${city.id}: car-park WFS answer is not GeoJSON`);
      return parsed;
    }
  }
}

/** `now` is for tests, which step through the trend window and the DB interval. */
export function createParkingIngestion(cache: Cache, db: Db | null = null, now: () => number = Date.now) {
  const lastSaved = new Map<string, number>();
  /** Per city, each car park's recent readings, oldest first. */
  const history = new Map<string, Map<string, Reading[]>>();
  return async function ingestParking(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.parking;
      if (!source) continue;
      try {
        const data = await fetchCity(city, source);
        if (!data) continue;
        if (data.facilities.length === 0) {
          // No car park with live counts is a broken feed, not an empty city: keep the last list
          log.warn(`${city.id}: no car park reports free spaces`);
          continue;
        }
        const t = now();
        const cityHistory = history.get(city.id) ?? new Map<string, Reading[]>();
        history.set(city.id, cityHistory);
        for (const f of data.facilities) {
          const readings = (cityHistory.get(f.id) ?? []).filter((r) => t - r.at <= TREND_MAX_AGE_MS);
          f.trend = f.status === 'open' ? parkingTrend(f.free, f.total, readings, t) : null;
          readings.push({ at: t, free: f.free });
          cityHistory.set(f.id, readings);
        }
        cache.set(CK.parking(city.id), data, PARKING_TTL_SECONDS);
        if (db && t - (lastSaved.get(city.id) ?? -Infinity) >= PARKING_DB_INTERVAL_MS) {
          try {
            await saveParking(db, city.id, data);
            lastSaved.set(city.id, t);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        const free = data.facilities.reduce((sum, f) => sum + (f.status === 'open' ? f.free : 0), 0);
        log.info(`${city.id}: ${data.facilities.length} car parks with live counts, ${free} free spaces`);
      } catch (err) {
        log.error(`${city.id} parking failed`, err);
      }
    }
  };
}
