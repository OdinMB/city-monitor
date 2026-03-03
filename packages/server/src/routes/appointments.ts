/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { BuergeramtData } from '../cron/ingest-appointments.js';
import { getCityConfig } from '../config/index.js';

const EMPTY_DEFAULT: BuergeramtData = {
  services: [],
  fetchedAt: '',
  bookingUrl: 'https://service.berlin.de/terminvereinbarung/',
};

export function createAppointmentsRouter(cache: Cache) {
  const router = Router();

  router.get('/:city/appointments', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const data = cache.get<BuergeramtData>(`${city.id}:appointments`);
    res.json(data ?? EMPTY_DEFAULT);
  });

  return router;
}
