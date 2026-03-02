/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Db } from './index.js';
import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';
import { loadWeather, loadTransitAlerts, loadEvents, loadSafetyReports, loadSummary } from './reads.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('warm-cache');

export async function warmCache(db: Db, cache: Cache): Promise<void> {
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
      const summary = await loadSummary(db, city.id);
      if (summary) cache.set(`${city.id}:news:summary`, summary, 86400);
    } catch (err) {
      log.error(`${city.id} summary failed`, err);
    }
  }

  log.info('done');
}
