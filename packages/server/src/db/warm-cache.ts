/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Db } from './index.js';
import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';
import { loadWeather, loadTransitAlerts, loadEvents, loadSafetyReports, loadNewsItems, loadSummary, loadNinaWarnings, loadAllGeocodeLookups } from './reads.js';
import { setGeocodeCacheEntry } from '../lib/geocode.js';
import { applyDropLogic, type NewsDigest, type NewsItem } from '../cron/ingest-feeds.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('warm-cache');

export async function warmCache(db: Db, cache: Cache): Promise<void> {
  // Geocode lookups are global — warm before per-city data
  try {
    const lookups = await loadAllGeocodeLookups(db);
    for (const row of lookups) {
      setGeocodeCacheEntry(row.query, { lat: row.lat, lon: row.lon, displayName: row.displayName });
    }
    if (lookups.length > 0) log.info(`warmed ${lookups.length} geocode lookup(s)`);
  } catch (err) {
    log.error('geocode lookups failed', err);
  }

  const cities = getActiveCities();
  log.info(`warming cache for ${cities.length} city(ies)…`);

  for (const city of cities) {
    try {
      const weather = await loadWeather(db, city.id);
      if (weather) cache.set(`${city.id}:weather`, weather, 1800);
    } catch (err) {
      log.error(`${city.id} weather failed`, err);
    }

    try {
      const alerts = await loadTransitAlerts(db, city.id);
      if (alerts) cache.set(`${city.id}:transit:alerts`, alerts, 1200);
    } catch (err) {
      log.error(`${city.id} transit failed`, err);
    }

    try {
      const items = await loadEvents(db, city.id);
      if (items) cache.set(`${city.id}:events:upcoming`, items, 21600);
    } catch (err) {
      log.error(`${city.id} events failed`, err);
    }

    try {
      const reports = await loadSafetyReports(db, city.id);
      if (reports) cache.set(`${city.id}:safety:recent`, reports, 900);
    } catch (err) {
      log.error(`${city.id} safety failed`, err);
    }

    try {
      const items = await loadNewsItems(db, city.id);
      if (items && items.length > 0) {
        const digest = buildDigestFromItems(items);
        cache.set(`${city.id}:news:digest`, digest, 900);
        for (const [cat, catItems] of Object.entries(digest.categories)) {
          cache.set(`${city.id}:news:${cat}`, catItems, 900);
        }
      }
    } catch (err) {
      log.error(`${city.id} news failed`, err);
    }

    try {
      const summary = await loadSummary(db, city.id);
      if (summary) cache.set(`${city.id}:news:summary`, summary, 86400);
    } catch (err) {
      log.error(`${city.id} summary failed`, err);
    }

    try {
      const warnings = await loadNinaWarnings(db, city.id);
      if (warnings) cache.set(`${city.id}:nina:warnings`, warnings, 600);
    } catch (err) {
      log.error(`${city.id} nina failed`, err);
    }
  }

  log.info('done');
}

function buildDigestFromItems(items: import('./writes.js').PersistedNewsItem[]): NewsDigest {
  const filtered = applyDropLogic(items);

  const categories: Record<string, NewsItem[]> = {};
  for (const item of filtered) {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category]!.push(item);
  }

  return {
    items: filtered,
    categories,
    updatedAt: new Date().toISOString(),
  };
}
