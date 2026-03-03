/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadAppointments } from '../db/reads.js';
import type { BuergeramtData } from '../cron/ingest-appointments.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('route:appointments');

const EMPTY_DEFAULT: BuergeramtData = {
  services: [],
  fetchedAt: '',
  bookingUrl: 'https://service.berlin.de/terminvereinbarung/',
};

export function createAppointmentsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/appointments', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<BuergeramtData>(`${city.id}:appointments`);
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const stored = await loadAppointments(db, city.id);
        if (stored) {
          cache.set(`${city.id}:appointments`, stored, 21600);
          res.json({ data: stored, fetchedAt: new Date().toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: EMPTY_DEFAULT, fetchedAt: null });
  });

  return router;
}
