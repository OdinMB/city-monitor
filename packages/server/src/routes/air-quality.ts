import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import type { AirQuality } from '@city-monitor/shared';
import { AIR_QUALITY_TTL_SECONDS, ingestCityAirQuality } from '../cron/ingest-weather.js';
import type { AirQualityGridPoint } from '../cron/ingest-air-quality-grid.js';
import { AQ_GRID_TTL_SECONDS, ingestCityAirQualityGrid } from '../cron/ingest-air-quality-grid.js';
import { loadAirQualityGrid } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { CK } from '../lib/cache-keys.js';

/**
 * How long a refill that found nothing is remembered. Shorter than the cache's
 * default 120 s: a visitor who gets the empty answer keeps it until the tile's
 * next poll (30 min), so a one-off glitch should reach as few visitors as
 * possible, while an outage still costs at most one upstream run per window.
 */
const REFILL_NEGATIVE_TTL_SECONDS = 30;

/**
 * Fills an empty cache entry by running its ingestion through `cache.fetch`,
 * so concurrent misses share one run and a run that leaves the entry empty is
 * negative-cached: while a provider is down, visitors neither each call it nor
 * each wait for its timeout. The ingestion writes the entry itself; the
 * fetcher reads it back rather than caching null on an error, and `fetch`
 * keeps the entry it finds, so data the cron job or a concurrent DB fallback
 * stored meanwhile is kept with its own fetchedAt.
 */
async function refillFromUpstream<T>(
  cache: Cache,
  key: string,
  ttlSeconds: number,
  ingest: () => Promise<void>,
): Promise<{ data: T; fetchedAt: string } | null> {
  await cache.fetch<T>(key, ttlSeconds, async () => {
    try {
      await ingest();
    } catch {
      // Nothing stored: the read below returns null and fetch negative-caches it
    }
    return cache.get<T>(key);
  }, REFILL_NEGATIVE_TTL_SECONDS);
  return cache.getWithMeta<T>(key);
}

export function createAirQualityRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/air-quality', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const key = CK.airQuality(city.id);
    // Cache miss — fetch immediately instead of waiting for the next cron cycle
    const cached = cache.getWithMeta<AirQuality>(key)
      ?? await refillFromUpstream<AirQuality>(cache, key, AIR_QUALITY_TTL_SECONDS, () => ingestCityAirQuality(city, cache));

    res.json(cached ?? { data: null, fetchedAt: null });
  });

  router.get('/:city/air-quality/grid', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const key = CK.airQualityGrid(city.id);
    let cached = cache.getWithMeta<AirQualityGridPoint[]>(key);

    // Cache miss — try DB before live fetch (cache → DB → API). The stored
    // grid has no WAQI stations; the next ingestion puts them back in the cache.
    if (!cached && db) {
      try {
        const result = await loadAirQualityGrid(db, city.id);
        if (result) {
          cache.set(key, result.data, AQ_GRID_TTL_SECONDS, result.fetchedAt);
          cached = cache.getWithMeta<AirQualityGridPoint[]>(key);
        }
      } catch {
        // Fall through to live fetch
      }
    }

    // Still no data — fetch from WAQI + Sensor.Community
    if (!cached) {
      cached = await refillFromUpstream<AirQualityGridPoint[]>(
        cache, key, AQ_GRID_TTL_SECONDS, () => ingestCityAirQualityGrid(city, cache, db),
      );
    }

    res.json(cached ?? { data: [], fetchedAt: null });
  });

  return router;
}
