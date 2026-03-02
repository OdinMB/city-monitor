/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import cors from 'cors';
import { createCache } from './lib/cache.js';
import { createScheduler, type ScheduledJob } from './lib/scheduler.js';
import { createDb } from './db/index.js';
import { warmCache } from './db/warm-cache.js';
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
import { createDataRetention } from './cron/data-retention.js';

export async function createApp(options?: { skipScheduler?: boolean }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const cache = createCache();
  const db = createDb();

  if (db) {
    await warmCache(db, cache);
  }

  const ingestFeeds = createFeedIngestion(cache);
  const ingestWeather = createWeatherIngestion(cache, db);
  const summarizeNews = createSummarization(cache, db);
  const ingestTransit = createTransitIngestion(cache, db);
  const ingestEvents = createEventsIngestion(cache, db);
  const ingestSafety = createSafetyIngestion(cache, db);

  const retainData = db ? createDataRetention(db) : async () => {};

  const jobs: ScheduledJob[] = [
    { name: 'ingest-feeds', schedule: '*/10 * * * *', handler: ingestFeeds, runOnStart: true },
    { name: 'summarize-news', schedule: '5,20,35,50 * * * *', handler: summarizeNews, runOnStart: true },
    { name: 'ingest-weather', schedule: '*/30 * * * *', handler: ingestWeather, runOnStart: true },
    { name: 'ingest-transit', schedule: '*/5 * * * *', handler: ingestTransit, runOnStart: true },
    { name: 'ingest-events', schedule: '0 */6 * * *', handler: ingestEvents, runOnStart: true },
    { name: 'ingest-safety', schedule: '*/10 * * * *', handler: ingestSafety, runOnStart: true },
    { name: 'data-retention', schedule: '0 3 * * *', handler: retainData },
  ];

  const scheduler = options?.skipScheduler
    ? { getJobs: () => [], stop: () => {} }
    : createScheduler(jobs);

  // Cache-Control per route tier (max-age < cron interval)
  const cacheFor = (seconds: number): express.RequestHandler =>
    (_req, res, next) => { res.set('Cache-Control', `public, max-age=${seconds}`); next(); };

  app.use('/api', createHealthRouter(cache, scheduler as any));
  app.use('/api', cacheFor(300), createNewsRouter(cache, db));
  app.use('/api', cacheFor(300), createWeatherRouter(cache, db));
  app.use('/api', cacheFor(120), createTransitRouter(cache, db));
  app.use('/api', cacheFor(1800), createEventsRouter(cache, db));
  app.use('/api', cacheFor(300), createSafetyRouter(cache, db));

  return { app, cache, db, scheduler };
}
