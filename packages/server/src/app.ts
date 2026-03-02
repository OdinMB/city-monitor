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
import { createTransitRouter } from './routes/transit.js';
import { createEventsRouter } from './routes/events.js';
import { createSafetyRouter } from './routes/safety.js';
import { createFeedIngestion } from './cron/ingest-feeds.js';
import { createWeatherIngestion } from './cron/ingest-weather.js';
import { createSummarization } from './cron/summarize.js';
import { createTransitIngestion } from './cron/ingest-transit.js';
import { createEventsIngestion } from './cron/ingest-events.js';
import { createSafetyIngestion } from './cron/ingest-safety.js';

export function createApp(options?: { skipScheduler?: boolean }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const cache = createCache();
  const ingestFeeds = createFeedIngestion(cache);
  const ingestWeather = createWeatherIngestion(cache);
  const summarizeNews = createSummarization(cache);
  const ingestTransit = createTransitIngestion(cache);
  const ingestEvents = createEventsIngestion(cache);
  const ingestSafety = createSafetyIngestion(cache);

  const jobs: ScheduledJob[] = [
    { name: 'ingest-feeds', schedule: '*/10 * * * *', handler: ingestFeeds, runOnStart: true },
    { name: 'summarize-news', schedule: '5,20,35,50 * * * *', handler: summarizeNews },
    { name: 'ingest-weather', schedule: '*/30 * * * *', handler: ingestWeather, runOnStart: true },
    { name: 'ingest-transit', schedule: '*/5 * * * *', handler: ingestTransit, runOnStart: true },
    { name: 'ingest-events', schedule: '0 */6 * * *', handler: ingestEvents },
    { name: 'ingest-safety', schedule: '*/10 * * * *', handler: ingestSafety, runOnStart: true },
  ];

  const scheduler = options?.skipScheduler
    ? { getJobs: () => [], stop: () => {} }
    : createScheduler(jobs);

  app.use('/api', createHealthRouter(cache, scheduler as any));
  app.use('/api', createNewsRouter(cache));
  app.use('/api', createWeatherRouter(cache));
  app.use('/api', createTransitRouter(cache));
  app.use('/api', createEventsRouter(cache));
  app.use('/api', createSafetyRouter(cache));

  return { app, cache, scheduler };
}
