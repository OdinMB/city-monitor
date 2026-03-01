/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Scheduler } from '../lib/scheduler.js';
import { getActiveCities } from '../config/index.js';
import { getUsageStats } from '../lib/openai.js';

export function createHealthRouter(cache: Cache, scheduler: Scheduler) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      activeCities: getActiveCities().map((c) => c.id),
      cache: { entries: cache.size() },
      scheduler: {
        jobs: scheduler.getJobs().map((j) => ({
          name: j.name,
          lastRun: j.lastRun?.toISOString() ?? null,
        })),
      },
      ai: getUsageStats(),
    });
  });

  return router;
}
