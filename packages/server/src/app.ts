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
import { createWeatherTilesRouter } from './routes/weather-tiles.js';
import { createConstructionRouter } from './routes/construction.js';
import { createAedsRouter } from './routes/aeds.js';
import { createSocialAtlasRouter } from './routes/social-atlas.js';
import { createAppointmentsRouter } from './routes/appointments.js';
import { createWaterLevelsRouter } from './routes/water-levels.js';
import { createBudgetRouter } from './routes/budget.js';
import { createBathingRouter } from './routes/bathing.js';
import { createWastewaterRouter } from './routes/wastewater.js';
import { createLaborMarketRouter } from './routes/labor-market.js';
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
import { createPoliticalIngestion, preCacheBezirke } from './cron/ingest-political.js';
import { createAirQualityGridIngestion } from './cron/ingest-air-quality-grid.js';
import { createConstructionIngestion } from './cron/ingest-construction.js';
import { createAedIngestion } from './cron/ingest-aeds.js';
import { createSocialAtlasIngestion } from './cron/ingest-social-atlas.js';
import { createWaterLevelIngestion } from './cron/ingest-water-levels.js';
import { createBudgetIngestion } from './cron/ingest-budget.js';
import { createAppointmentIngestion } from './cron/ingest-appointments.js';
import { createBathingIngestion } from './cron/ingest-bathing.js';
import { createWastewaterIngestion } from './cron/ingest-wastewater.js';
import { createLaborMarketIngestion } from './cron/ingest-labor-market.js';
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

  // Pre-cache hardcoded political data so it's available before cron jobs finish
  preCacheBezirke(cache);

  const ingestFeeds = createFeedIngestion(cache, db);
  const ingestWeather = createWeatherIngestion(cache, db);
  const summarizeNews = createSummarization(cache, db);
  const ingestTransit = createTransitIngestion(cache, db);
  const ingestEvents = createEventsIngestion(cache, db);
  const ingestSafety = createSafetyIngestion(cache, db);
  const ingestNina = createNinaIngestion(cache, db);
  const ingestPharmacies = createPharmacyIngestion(cache, db);
  const ingestTraffic = createTrafficIngestion(cache, db);
  const ingestPolitical = createPoliticalIngestion(cache, db);
  const ingestAqGrid = createAirQualityGridIngestion(cache, db);
  const ingestConstruction = createConstructionIngestion(cache, db);
  const ingestAeds = createAedIngestion(cache, db);
  const ingestSocialAtlas = createSocialAtlasIngestion(cache, db);
  const ingestWaterLevels = createWaterLevelIngestion(cache, db);
  const ingestBudget = createBudgetIngestion(cache, db);
  const ingestAppointments = createAppointmentIngestion(cache, db);
  const ingestBathing = createBathingIngestion(cache, db);
  const ingestWastewater = createWastewaterIngestion(cache, db);
  const ingestLaborMarket = createLaborMarketIngestion(cache, db);

  const retainData = db ? createDataRetention(db) : async () => {};

  // All domains now have DB persistence — warmCache() loads data from Postgres
  // on startup, so runOnStart is no longer needed. Cron jobs refresh on schedule.
  const jobs: ScheduledJob[] = [
    { name: 'ingest-feeds', schedule: '*/10 * * * *', handler: ingestFeeds },
    { name: 'summarize-news', schedule: '5,20,35,50 * * * *', handler: summarizeNews, dependsOn: ['ingest-feeds'] },
    { name: 'ingest-weather', schedule: '*/30 * * * *', handler: ingestWeather },
    { name: 'ingest-transit', schedule: '*/15 * * * *', handler: ingestTransit },
    { name: 'ingest-events', schedule: '0 */6 * * *', handler: ingestEvents },
    { name: 'ingest-safety', schedule: '*/10 * * * *', handler: ingestSafety },
    { name: 'ingest-nina', schedule: '*/5 * * * *', handler: ingestNina },
    { name: 'ingest-pharmacies', schedule: '0 */6 * * *', handler: ingestPharmacies },
    { name: 'ingest-traffic', schedule: '*/5 * * * *', handler: ingestTraffic },
    { name: 'ingest-political', schedule: '0 4 * * 1', handler: ingestPolitical },
    { name: 'ingest-aq-grid', schedule: '*/30 * * * *', handler: ingestAqGrid },
    { name: 'ingest-construction', schedule: '*/30 * * * *', handler: ingestConstruction },
    { name: 'ingest-aeds', schedule: '0 0 * * *', handler: ingestAeds },
    { name: 'ingest-social-atlas', schedule: '0 5 * * 0', handler: ingestSocialAtlas },
    { name: 'ingest-water-levels', schedule: '*/15 * * * *', handler: ingestWaterLevels },
    { name: 'ingest-budget', schedule: '0 6 * * *', handler: ingestBudget },
    { name: 'ingest-appointments', schedule: '0 */6 * * *', handler: ingestAppointments },
    { name: 'ingest-bathing', schedule: '0 6 * * *', handler: ingestBathing },
    { name: 'ingest-wastewater', schedule: '0 6 * * *', handler: ingestWastewater },
    { name: 'ingest-labor-market', schedule: '0 7 * * *', handler: ingestLaborMarket },
    { name: 'data-retention', schedule: '0 3 * * *', handler: retainData },
  ];

  const scheduler = options?.skipScheduler
    ? { getJobs: () => [], stop: () => {} }
    : createScheduler(jobs);

  // Cache-Control per route tier (max-age < cron interval)
  const cacheFor = (seconds: number): express.RequestHandler =>
    (_req, res, next) => { res.set('Cache-Control', `public, max-age=${seconds}`); next(); };

  app.use('/api', createHealthRouter(cache, scheduler));
  app.use('/api', cacheFor(300), createNewsRouter(cache, db));
  app.use('/api', cacheFor(300), createWeatherRouter(cache, db));
  app.use('/api', cacheFor(120), createTransitRouter(cache, db));
  app.use('/api', cacheFor(1800), createEventsRouter(cache, db));
  app.use('/api', cacheFor(300), createSafetyRouter(cache, db));
  app.use('/api', cacheFor(120), createNinaRouter(cache, db));
  app.use('/api', cacheFor(600), createAirQualityRouter(cache, db));
  app.use('/api', cacheFor(3600), createPharmaciesRouter(cache, db));
  app.use('/api', cacheFor(120), createTrafficRouter(cache, db));
  app.use('/api', cacheFor(900), createConstructionRouter(cache, db));
  app.use('/api', cacheFor(43200), createAedsRouter(cache, db));
  app.use('/api', cacheFor(43200), createSocialAtlasRouter(cache, db));
  app.use('/api', cacheFor(300), createWaterLevelsRouter(cache, db));
  app.use('/api', cacheFor(3600), createPoliticalRouter(cache));
  app.use('/api', cacheFor(3600), createBudgetRouter(cache, db));
  app.use('/api', cacheFor(3600), createAppointmentsRouter(cache, db));
  app.use('/api', cacheFor(43200), createBathingRouter(cache, db));
  app.use('/api', cacheFor(43200), createWastewaterRouter(cache, db));
  app.use('/api', cacheFor(3600), createLaborMarketRouter(cache, db));
  app.use('/api', cacheFor(600), createWeatherTilesRouter());

  return { app, cache, db, scheduler };
}
