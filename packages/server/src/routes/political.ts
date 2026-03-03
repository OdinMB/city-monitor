/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { PoliticalDistrict } from '../cron/ingest-political.js';
import { getCityConfig } from '../config/index.js';
import { CK } from '../lib/cache-keys.js';

export function createPoliticalRouter(cache: Cache) {
  const router = Router();

  router.get('/:city/political/:level', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const level = req.params.level;
    const VALID_LEVELS = ['bundestag', 'state', 'bezirke', 'state-bezirke'];
    if (!VALID_LEVELS.includes(level)) {
      res.status(400).json({ error: `Invalid level. Use one of: ${VALID_LEVELS.join(', ')}` });
      return;
    }

    const cached = cache.getWithMeta<PoliticalDistrict[]>(CK.political(city.id, level));
    res.json(cached ?? { data: [], fetchedAt: null });
  });

  return router;
}
