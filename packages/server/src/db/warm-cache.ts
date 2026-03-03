/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Db } from './index.js';
import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';
import { loadWeather, loadTransitAlerts, loadEvents, loadSafetyReports, loadNewsItems, loadSummary, loadNinaWarnings, loadAirQualityGrid, loadPoliticalDistricts, loadAllGeocodeLookups, loadWaterLevels, loadAppointments, loadBudget, loadConstructionSites, loadTrafficIncidents, loadPharmacies, loadAeds, loadSocialAtlas, loadWastewater, loadBathingSpots, loadLaborMarket } from './reads.js';
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

  await Promise.allSettled(cities.map((city) => warmCity(db, cache, city.id)));

  log.info('done');
}

async function warmCity(db: Db, cache: Cache, cityId: string): Promise<void> {
  const tasks = [
    (async () => {
      const weather = await loadWeather(db, cityId);
      if (weather) cache.set(`${cityId}:weather`, weather, 1800);
    })().catch((err) => log.error(`${cityId} weather failed`, err)),

    (async () => {
      const alerts = await loadTransitAlerts(db, cityId);
      if (alerts) cache.set(`${cityId}:transit:alerts`, alerts, 1200);
    })().catch((err) => log.error(`${cityId} transit failed`, err)),

    (async () => {
      const items = await loadEvents(db, cityId);
      if (items) cache.set(`${cityId}:events:upcoming`, items, 21600);
    })().catch((err) => log.error(`${cityId} events failed`, err)),

    (async () => {
      const reports = await loadSafetyReports(db, cityId);
      if (reports) cache.set(`${cityId}:safety:recent`, reports, 900);
    })().catch((err) => log.error(`${cityId} safety failed`, err)),

    (async () => {
      const items = await loadNewsItems(db, cityId);
      if (items && items.length > 0) {
        const digest = buildDigestFromItems(items);
        cache.set(`${cityId}:news:digest`, digest, 900);
        for (const [cat, catItems] of Object.entries(digest.categories)) {
          cache.set(`${cityId}:news:${cat}`, catItems, 900);
        }
      }
    })().catch((err) => log.error(`${cityId} news failed`, err)),

    (async () => {
      const summary = await loadSummary(db, cityId);
      if (summary) cache.set(`${cityId}:news:summary`, summary, 86400);
    })().catch((err) => log.error(`${cityId} summary failed`, err)),

    (async () => {
      const warnings = await loadNinaWarnings(db, cityId);
      if (warnings) cache.set(`${cityId}:nina:warnings`, warnings, 600);
    })().catch((err) => log.error(`${cityId} nina failed`, err)),

    (async () => {
      const grid = await loadAirQualityGrid(db, cityId);
      if (grid) cache.set(`${cityId}:air-quality:grid`, grid, 1800);
    })().catch((err) => log.error(`${cityId} aq grid failed`, err)),

    (async () => {
      const waterLevels = await loadWaterLevels(db, cityId);
      if (waterLevels) cache.set(`${cityId}:water-levels`, waterLevels, 900);
    })().catch((err) => log.error(`${cityId} water levels failed`, err)),

    (async () => {
      const appointments = await loadAppointments(db, cityId);
      if (appointments) cache.set(`${cityId}:appointments`, appointments, 21600);
    })().catch((err) => log.error(`${cityId} appointments failed`, err)),

    ...(['bezirke', 'bundestag', 'state', 'state-bezirke'] as const).map((level) =>
      (async () => {
        const districts = await loadPoliticalDistricts(db, cityId, level);
        if (districts) cache.set(`${cityId}:political:${level}`, districts, 604800);
      })().catch((err) => log.error(`${cityId} political:${level} failed`, err)),
    ),

    (async () => {
      const budget = await loadBudget(db, cityId);
      if (budget) cache.set(`${cityId}:budget`, budget, 86400);
    })().catch((err) => log.error(`${cityId} budget failed`, err)),

    (async () => {
      const sites = await loadConstructionSites(db, cityId);
      if (sites) cache.set(`${cityId}:construction:sites`, sites, 1800);
    })().catch((err) => log.error(`${cityId} construction failed`, err)),

    (async () => {
      const incidents = await loadTrafficIncidents(db, cityId);
      if (incidents) cache.set(`${cityId}:traffic:incidents`, incidents, 300);
    })().catch((err) => log.error(`${cityId} traffic failed`, err)),

    (async () => {
      const pharmacies = await loadPharmacies(db, cityId);
      if (pharmacies) cache.set(`${cityId}:pharmacies:emergency`, pharmacies, 21600);
    })().catch((err) => log.error(`${cityId} pharmacies failed`, err)),

    (async () => {
      const aeds = await loadAeds(db, cityId);
      if (aeds) cache.set(`${cityId}:aed:locations`, aeds, 86400);
    })().catch((err) => log.error(`${cityId} aeds failed`, err)),

    (async () => {
      const geojson = await loadSocialAtlas(db, cityId);
      if (geojson) cache.set(`${cityId}:social-atlas:geojson`, geojson, 604800);
    })().catch((err) => log.error(`${cityId} social-atlas failed`, err)),

    // Wastewater, bathing, and labor market are Berlin-only data sources
    ...(cityId === 'berlin' ? [
      (async () => {
        const wastewater = await loadWastewater(db, 'berlin');
        if (wastewater) cache.set('berlin:wastewater:summary', wastewater, 604800);
      })().catch((err) => log.error('wastewater failed', err)),

      (async () => {
        const spots = await loadBathingSpots(db, 'berlin');
        if (spots) cache.set('berlin:bathing:spots', spots, 86400);
      })().catch((err) => log.error('bathing failed', err)),

      (async () => {
        const laborMarket = await loadLaborMarket(db, 'berlin');
        if (laborMarket) cache.set('berlin:labor-market', laborMarket, 86400);
      })().catch((err) => log.error('labor-market failed', err)),
    ] : []),
  ];

  await Promise.allSettled(tasks);
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
