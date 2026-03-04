import { createLogger } from './logger.js';
import type { Db } from '../db/index.js';
import { loadGeocodeLookup } from '../db/reads.js';
import { saveGeocodeLookup } from '../db/writes.js';

const log = createLogger('geocode');

// ---------------------------------------------------------------------------
// DB reference — set once at startup via initGeocodeDb()
// ---------------------------------------------------------------------------
let _db: Db | null = null;

export function initGeocodeDb(db: Db): void {
  _db = db;
}

const TIMEOUT_MS = 5_000;
const USER_AGENT = 'CityMonitor/1.0 (https://github.com/OdinMB/city-monitor)';

// ---------------------------------------------------------------------------
// Provider: Nominatim (primary) — free, 1 req/s
// ---------------------------------------------------------------------------
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_GAP_MS = 1100; // slightly over 1s to stay safe
let nominatimLastRequest = 0;

function nominatimAvailable(): boolean {
  return Date.now() - nominatimLastRequest >= NOMINATIM_GAP_MS;
}

async function waitForNominatim(): Promise<void> {
  const elapsed = Date.now() - nominatimLastRequest;
  if (elapsed < NOMINATIM_GAP_MS) {
    await new Promise<void>((r) => setTimeout(r, NOMINATIM_GAP_MS - elapsed));
  }
}

async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  nominatimLastRequest = Date.now();

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'de',
  });

  const response = await log.fetch(`${NOMINATIM_BASE}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    log.warn(`Nominatim returned ${response.status} for "${query}"`);
    return null;
  }

  return parseResponse(await response.json());
}

// ---------------------------------------------------------------------------
// Provider: LocationIQ (fallback) — requires LOCATIONIQ_TOKEN
// ---------------------------------------------------------------------------
const LOCATIONIQ_TOKEN = process.env.LOCATIONIQ_TOKEN;
const LOCATIONIQ_BASE = 'https://us1.locationiq.com/v1/search';
const LOCATIONIQ_GAP_MS = 500; // free tier: 2 QPS
let locationiqLastRequest = 0;

async function waitForLocationIQ(): Promise<void> {
  const elapsed = Date.now() - locationiqLastRequest;
  if (elapsed < LOCATIONIQ_GAP_MS) {
    await new Promise<void>((r) => setTimeout(r, LOCATIONIQ_GAP_MS - elapsed));
  }
}

async function geocodeLocationIQ(query: string): Promise<GeocodeResult | null> {
  if (!LOCATIONIQ_TOKEN) return null;

  await waitForLocationIQ();
  locationiqLastRequest = Date.now();

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'de',
    key: LOCATIONIQ_TOKEN,
  });

  const response = await log.fetch(`${LOCATIONIQ_BASE}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    log.warn(`LocationIQ returned ${response.status} for "${query}"`);
    return null;
  }

  return parseResponse(await response.json());
}

// ---------------------------------------------------------------------------
// In-process cache — location names are stable landmarks, cache indefinitely
// ---------------------------------------------------------------------------
const geocodeCache = new Map<string, GeocodeResult | null>();

export function clearGeocodeCache(): void {
  geocodeCache.clear();
}

/** Populate the in-process Map from DB rows (used by warm-cache). */
export function setGeocodeCacheEntry(key: string, result: GeocodeResult): void {
  geocodeCache.set(key, result);
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

function parseResponse(
  results: Array<{ lat: string; lon: string; display_name: string }>,
): GeocodeResult | null {
  if (!results || results.length === 0) return null;
  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
    displayName: results[0].display_name,
  };
}

/**
 * Geocode a location string.
 *
 * Strategy:
 * 1. If Nominatim rate limit is available, use Nominatim (free, 1 req/s).
 * 2. If Nominatim is rate-limited and LOCATIONIQ_TOKEN is set, use LocationIQ.
 * 3. If no LocationIQ token, wait for Nominatim.
 */
export async function geocode(
  location: string,
  cityName: string,
): Promise<GeocodeResult | null> {
  const query = `${location}, ${cityName}`;
  const cacheKey = query.toLowerCase();

  // Layer 1: In-process Map
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) ?? null;
  }

  // Layer 2: DB lookup (survives restarts)
  if (_db) {
    try {
      const dbRow = await loadGeocodeLookup(_db, cacheKey);
      if (dbRow) {
        const result: GeocodeResult = { lat: dbRow.lat, lon: dbRow.lon, displayName: dbRow.displayName };
        geocodeCache.set(cacheKey, result);
        return result;
      }
    } catch {
      log.warn(`DB lookup failed for "${cacheKey}"`);
    }
  }

  // Layer 3: External API
  try {
    let result: GeocodeResult | null;
    let provider: string;

    // Nominatim slot available — use it
    if (nominatimAvailable()) {
      result = await geocodeNominatim(query);
      provider = 'nominatim';
    } else if (LOCATIONIQ_TOKEN) {
      // Nominatim busy — try LocationIQ if available
      result = await geocodeLocationIQ(query);
      provider = 'locationiq';
      if (!result) {
        // LocationIQ failed — fall through to wait for Nominatim
        await waitForNominatim();
        result = await geocodeNominatim(query);
        provider = 'nominatim';
      }
    } else {
      // Wait for Nominatim
      await waitForNominatim();
      result = await geocodeNominatim(query);
      provider = 'nominatim';
    }

    geocodeCache.set(cacheKey, result);

    // Persist successful results to DB (failed lookups stay in-process only)
    if (result && _db) {
      saveGeocodeLookup(_db, cacheKey, result, provider).catch((_err) => {
        log.warn(`DB write failed for "${cacheKey}"`);
      });
    }

    return result;
  } catch {
    log.warn(`geocode failed for "${query}"`);
    // Don't cache — transient errors should be retried on next call
    return null;
  }
}
