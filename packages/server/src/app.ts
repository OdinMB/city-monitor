/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import cors from 'cors';
import { createCache } from './lib/cache.js';
import { createScheduler, type ScheduledJob } from './lib/scheduler.js';
import { createHealthRouter } from './routes/health.js';

export function createApp(options?: { skipScheduler?: boolean }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const cache = createCache();

  // Cron jobs — handlers are stubs for now, implemented in later milestones
  const jobs: ScheduledJob[] = [
    { name: 'ingest-feeds', schedule: '*/10 * * * *', handler: async () => {}, runOnStart: true },
    { name: 'summarize-news', schedule: '5,20,35,50 * * * *', handler: async () => {} },
    { name: 'ingest-weather', schedule: '*/30 * * * *', handler: async () => {}, runOnStart: true },
    { name: 'ingest-transit', schedule: '*/5 * * * *', handler: async () => {}, runOnStart: true },
    { name: 'ingest-events', schedule: '0 */6 * * *', handler: async () => {} },
  ];

  const scheduler = options?.skipScheduler
    ? { getJobs: () => [], stop: () => {} }
    : createScheduler(jobs);

  app.use('/api', createHealthRouter(cache, scheduler as any));

  return { app, cache, scheduler };
}
