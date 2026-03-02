/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import { getCityConfig } from '../config/index.js';
import type { SafetyReport } from '../cron/ingest-safety.js';

export function createSafetyRouter(cache: Cache) {
  const router = Router();

  router.get('/:city/safety', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const reports = cache.get<SafetyReport[]>(`${city.id}:safety:recent`);
    if (!reports) {
      res.json([]);
      return;
    }

    res.json(reports);
  });

  return router;
}
