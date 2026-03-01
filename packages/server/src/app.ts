/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import cors from 'cors';
import { createCache } from './lib/cache.js';
import { createScheduler, type ScheduledJob } from './lib/scheduler.js';
import { createHealthRouter } from './routes/health.js';
import { createNewsRouter } from './routes/news.js';
import { createWeatherRouter } from './routes/weather.js';
import { createFeedIngestion } from './cron/ingest-feeds.js';
import { createWeatherIngestion } from './cron/ingest-weather.js';

export function createApp(options?: { skipScheduler?: boolean }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const cache = createCache();
  const ingestFeeds = createFeedIngestion(cache);
  const ingestWeather = createWeatherIngestion(cache);

  const jobs: ScheduledJob[] = [
    { name: 'ingest-feeds', schedule: '*/10 * * * *', handler: ingestFeeds, runOnStart: true },
    { name: 'summarize-news', schedule: '5,20,35,50 * * * *', handler: async () => {} },
    { name: 'ingest-weather', schedule: '*/30 * * * *', handler: ingestWeather, runOnStart: true },
    { name: 'ingest-transit', schedule: '*/5 * * * *', handler: async () => {}, runOnStart: true },
    { name: 'ingest-events', schedule: '0 */6 * * *', handler: async () => {} },
  ];

  const scheduler = options?.skipScheduler
    ? { getJobs: () => [], stop: () => {} }
    : createScheduler(jobs);

  app.use('/api', createHealthRouter(cache, scheduler as any));
  app.use('/api', createNewsRouter(cache));
  app.use('/api', createWeatherRouter(cache));

  return { app, cache, scheduler };
}
