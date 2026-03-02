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
import { createNinaRouter } from './routes/nina.js';
import { createAirQualityRouter } from './routes/air-quality.js';
import { createPharmaciesRouter } from './routes/pharmacies.js';
import { createTrafficRouter } from './routes/traffic.js';
import { createPoliticalRouter } from './routes/political.js';
import { createFeedIngestion } from './cron/ingest-feeds.js';
import { createWeatherIngestion } from './cron/ingest-weather.js';
import { createSummarization } from './cron/summarize.js';
import { createTransitIngestion } from './cron/ingest-transit.js';
import { createEventsIngestion } from './cron/ingest-events.js';
import { createSafetyIngestion } from './cron/ingest-safety.js';
import { createNinaIngestion } from './cron/ingest-nina.js';
import { createDataRetention } from './cron/data-retention.js';
import { createPharmacyIngestion } from './cron/ingest-pharmacies.js';
import { createTrafficIngestion } from './cron/ingest-traffic.js';
import { createPoliticalIngestion } from './cron/ingest-political.js';
import { createAirQualityGridIngestion } from './cron/ingest-air-quality-grid.js';
import { initGeocodeDb } from './lib/geocode.js';

export async function createApp(options?: { skipScheduler?: boolean }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const cache = createCache();
  const db = createDb();

  if (db) {
    initGeocodeDb(db);
    await warmCache(db, cache);
  }

  const ingestFeeds = createFeedIngestion(cache, db);
  const ingestWeather = createWeatherIngestion(cache, db);
  const summarizeNews = createSummarization(cache, db);
  const ingestTransit = createTransitIngestion(cache, db);
  const ingestEvents = createEventsIngestion(cache, db);
  const ingestSafety = createSafetyIngestion(cache, db);
  const ingestNina = createNinaIngestion(cache, db);
  const ingestPharmacies = createPharmacyIngestion(cache);
  const ingestTraffic = createTrafficIngestion(cache);
  const ingestPolitical = createPoliticalIngestion(cache);
  const ingestAqGrid = createAirQualityGridIngestion(cache);

  const retainData = db ? createDataRetention(db) : async () => {};

  const jobs: ScheduledJob[] = [
    { name: 'ingest-feeds', schedule: '*/10 * * * *', handler: ingestFeeds, runOnStart: true },
    { name: 'summarize-news', schedule: '5,20,35,50 * * * *', handler: summarizeNews, runOnStart: true },
    { name: 'ingest-weather', schedule: '*/30 * * * *', handler: ingestWeather, runOnStart: true },
    { name: 'ingest-transit', schedule: '*/15 * * * *', handler: ingestTransit, runOnStart: true },
    { name: 'ingest-events', schedule: '0 */6 * * *', handler: ingestEvents, runOnStart: true },
    { name: 'ingest-safety', schedule: '*/10 * * * *', handler: ingestSafety, runOnStart: true },
    { name: 'ingest-nina', schedule: '*/5 * * * *', handler: ingestNina, runOnStart: true },
    { name: 'ingest-pharmacies', schedule: '0 */6 * * *', handler: ingestPharmacies, runOnStart: true },
    { name: 'ingest-traffic', schedule: '*/5 * * * *', handler: ingestTraffic, runOnStart: true },
    { name: 'ingest-political', schedule: '0 4 * * 1', handler: ingestPolitical, runOnStart: true },
    { name: 'ingest-aq-grid', schedule: '*/30 * * * *', handler: ingestAqGrid, runOnStart: true },
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
  app.use('/api', cacheFor(120), createNinaRouter(cache, db));
  app.use('/api', cacheFor(600), createAirQualityRouter(cache));
  app.use('/api', cacheFor(3600), createPharmaciesRouter(cache));
  app.use('/api', cacheFor(120), createTrafficRouter(cache));
  app.use('/api', cacheFor(86400), createPoliticalRouter(cache));

  return { app, cache, db, scheduler };
}
