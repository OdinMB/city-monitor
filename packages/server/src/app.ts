import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createCache } from './lib/cache.js';
import { createScheduler, type JobInfo, type ScheduledJob } from './lib/scheduler.js';
import { createDb, testConnection } from './db/index.js';
import { warmCache, findStaleJobs, type FreshnessSpec } from './db/warm-cache.js';
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
import { createPopulationRouter } from './routes/population.js';
import { createFeuerwehrRouter } from './routes/feuerwehr.js';
import { createPollenRouter } from './routes/pollen.js';
import { createNoiseSensorsRouter } from './routes/noise-sensors.js';
import { createCouncilMeetingsRouter } from './routes/council-meetings.js';
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
import { createPopulationIngestion } from './cron/ingest-population.js';
import { createFeuerwehrIngestion } from './cron/ingest-feuerwehr.js';
import { createPollenIngestion } from './cron/ingest-pollen.js';
import { createNoiseSensorIngestion } from './cron/ingest-noise-sensors.js';
import { createCouncilMeetingIngestion } from './cron/ingest-council-meetings.js';
import { initGeocodeDb } from './lib/geocode.js';
import { validateCity } from './lib/validate-city.js';

export async function createApp(options?: { skipScheduler?: boolean }) {
  const app = express();
  app.set('trust proxy', 1); // Render reverse proxy
  app.use(compression());
  app.use(helmet());

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://citymonitor.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://localhost:5173');
  }
  app.use(cors({ origin: allowedOrigins }));

  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) {
    app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));
  }
  app.use(express.json());

  const cache = createCache();
  const dbResult = createDb();
  const db = dbResult?.db ?? null;

  if (db) {
    await testConnection(db);
    initGeocodeDb(db);
    await warmCache(db, cache);
  }

  // Pre-cache hardcoded political data so it's available before cron jobs finish
  preCacheBezirke(cache);

  // Check which domains have stale/missing data and need a startup refresh.
  // Max age is roughly the cron interval — data older than that is overdue.
  const FRESHNESS_SPECS: FreshnessSpec[] = [
    // Non-snapshot tables
    { jobName: 'ingest-feeds',        tableName: 'news_items',    maxAgeSeconds: 600 },
    { jobName: 'summarize-news',      tableName: 'ai_summaries',  maxAgeSeconds: 1200 },
    { jobName: 'ingest-events',       tableName: 'events',        maxAgeSeconds: 21600 },
    { jobName: 'ingest-safety',       tableName: 'safety_reports', maxAgeSeconds: 600 },

    // Unified snapshots table (with type filter — values are concrete data source names)
    { jobName: 'ingest-weather',      tableName: 'snapshots', maxAgeSeconds: 1800,    filter: { column: 'type', value: 'open-meteo' } },
    { jobName: 'ingest-transit',      tableName: 'snapshots', maxAgeSeconds: 900,     filter: { column: 'type', value: 'vbb-disruptions' } },
    { jobName: 'ingest-nina',         tableName: 'snapshots', maxAgeSeconds: 300,     filter: { column: 'type', value: 'bbk-nina' } },
    { jobName: 'ingest-pharmacies',   tableName: 'snapshots', maxAgeSeconds: 21600,   filter: { column: 'type', value: 'aponet' } },
    { jobName: 'ingest-traffic',      tableName: 'snapshots', maxAgeSeconds: 300,     filter: { column: 'type', value: 'tomtom-traffic' } },
    { jobName: 'ingest-political',    tableName: 'snapshots', maxAgeSeconds: 604800,  filter: { column: 'type', value: 'abgwatch-bundestag' } },
    { jobName: 'ingest-aq-grid',      tableName: 'snapshots', maxAgeSeconds: 1800,    filter: { column: 'type', value: 'aqi-grid' } },
    { jobName: 'ingest-construction', tableName: 'snapshots', maxAgeSeconds: 1800,    filter: { column: 'type', value: 'viz-roadworks' } },
    { jobName: 'ingest-aeds',         tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'osm-aeds' } },
    { jobName: 'ingest-social-atlas', tableName: 'snapshots', maxAgeSeconds: 604800,  filter: { column: 'type', value: 'mss-social-atlas' } },
    { jobName: 'ingest-water-levels', tableName: 'snapshots', maxAgeSeconds: 900,     filter: { column: 'type', value: 'pegelonline' } },
    { jobName: 'ingest-budget',       tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'berlin-haushalt' } },
    { jobName: 'ingest-appointments', tableName: 'snapshots', maxAgeSeconds: 21600,   filter: { column: 'type', value: 'service-berlin' } },
    { jobName: 'ingest-bathing',      tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'lageso-bathing' } },
    { jobName: 'ingest-wastewater',   tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'lageso-wastewater' } },
    { jobName: 'ingest-labor-market', tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'ba-labor-market' } },
    { jobName: 'ingest-population',   tableName: 'snapshots', maxAgeSeconds: 2592000, filter: { column: 'type', value: 'afstat-population' } },
    { jobName: 'ingest-feuerwehr',    tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'bf-feuerwehr' } },
    { jobName: 'ingest-pollen',       tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'dwd-pollen' } },
    { jobName: 'ingest-noise-sensors', tableName: 'snapshots', maxAgeSeconds: 1800,   filter: { column: 'type', value: 'sc-dnms' } },
    { jobName: 'ingest-council-meetings', tableName: 'snapshots', maxAgeSeconds: 21600, filter: { column: 'type', value: 'oparl-meetings' } },
  ];

  const stale = db
    ? await findStaleJobs(db, FRESHNESS_SPECS)
    : new Set(FRESHNESS_SPECS.map((s) => s.jobName)); // no DB = refresh everything

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
  const ingestPopulation = createPopulationIngestion(cache, db);
  const ingestFeuerwehr = createFeuerwehrIngestion(cache, db);
  const ingestPollen = createPollenIngestion(cache, db);
  const ingestNoiseSensors = createNoiseSensorIngestion(cache, db);
  const ingestCouncilMeetings = createCouncilMeetingIngestion(cache, db);

  const retainData = db ? createDataRetention(db) : async () => {};

  const s = (name: string) => stale.has(name); // shorthand for runOnStart

  const jobs: ScheduledJob[] = [
    { name: 'ingest-feeds', schedule: '*/10 * * * *', handler: ingestFeeds, runOnStart: s('ingest-feeds') },
    { name: 'summarize-news', schedule: '5 */6 * * *', handler: summarizeNews, runOnStart: s('summarize-news'), dependsOn: ['ingest-feeds'] },
    { name: 'ingest-weather', schedule: '*/30 * * * *', handler: ingestWeather, runOnStart: s('ingest-weather') },
    { name: 'ingest-transit', schedule: '*/15 * * * *', handler: ingestTransit, runOnStart: s('ingest-transit') },
    { name: 'ingest-events', schedule: '0 */6 * * *', handler: ingestEvents, runOnStart: s('ingest-events') },
    { name: 'ingest-safety', schedule: '*/10 * * * *', handler: ingestSafety, runOnStart: s('ingest-safety') },
    { name: 'ingest-nina', schedule: '*/5 * * * *', handler: ingestNina, runOnStart: s('ingest-nina') },
    { name: 'ingest-pharmacies', schedule: '0 */6 * * *', handler: ingestPharmacies, runOnStart: s('ingest-pharmacies') },
    { name: 'ingest-traffic', schedule: '*/5 * * * *', handler: ingestTraffic, runOnStart: s('ingest-traffic') },
    { name: 'ingest-political', schedule: '0 4 * * 1', handler: ingestPolitical, runOnStart: s('ingest-political') },
    { name: 'ingest-aq-grid', schedule: '*/30 * * * *', handler: ingestAqGrid, runOnStart: s('ingest-aq-grid') },
    { name: 'ingest-construction', schedule: '*/30 * * * *', handler: ingestConstruction, runOnStart: s('ingest-construction') },
    { name: 'ingest-aeds', schedule: '0 0 * * *', handler: ingestAeds, runOnStart: s('ingest-aeds') },
    { name: 'ingest-social-atlas', schedule: '0 5 * * 0', handler: ingestSocialAtlas, runOnStart: s('ingest-social-atlas') },
    { name: 'ingest-water-levels', schedule: '*/15 * * * *', handler: ingestWaterLevels, runOnStart: s('ingest-water-levels') },
    { name: 'ingest-budget', schedule: '0 6 * * *', handler: ingestBudget, runOnStart: s('ingest-budget') },
    { name: 'ingest-appointments', schedule: '0 */6 * * *', handler: ingestAppointments, runOnStart: s('ingest-appointments') },
    { name: 'ingest-bathing', schedule: '0 6 * * *', handler: ingestBathing, runOnStart: s('ingest-bathing') },
    { name: 'ingest-wastewater', schedule: '0 6 * * *', handler: ingestWastewater, runOnStart: s('ingest-wastewater') },
    { name: 'ingest-labor-market', schedule: '0 7 * * *', handler: ingestLaborMarket, runOnStart: s('ingest-labor-market') },
    { name: 'ingest-population', schedule: '0 6 1 * *', handler: ingestPopulation, runOnStart: s('ingest-population'), dependsOn: ['ingest-social-atlas'] },
    { name: 'ingest-feuerwehr', schedule: '0 8 * * *', handler: ingestFeuerwehr, runOnStart: s('ingest-feuerwehr') },
    { name: 'ingest-pollen', schedule: '0 */6 * * *', handler: ingestPollen, runOnStart: s('ingest-pollen') },
    { name: 'ingest-noise-sensors', schedule: '*/10 * * * *', handler: ingestNoiseSensors, runOnStart: s('ingest-noise-sensors') },
    { name: 'ingest-council-meetings', schedule: '0 */6 * * *', handler: ingestCouncilMeetings, runOnStart: s('ingest-council-meetings') },
    { name: 'data-retention', schedule: '0 3 * * *', handler: retainData },
  ];

  const scheduler = options?.skipScheduler
    ? { getJobs: () => [] as JobInfo[], stop: () => {}, triggerJob: async () => false as boolean }
    : createScheduler(jobs);

  // Cache-Control per route tier (max-age < cron interval)
  const cacheFor = (seconds: number): express.RequestHandler =>
    (_req, res, next) => { res.set('Cache-Control', `public, max-age=${seconds}`); next(); };

  // Non-city routes (mounted before validateCity so /api/health, /api/weather-tiles aren't rejected)
  app.use('/api', createHealthRouter(cache, scheduler));
  app.use('/api', cacheFor(300), createWeatherTilesRouter());

  // Validate :city param on all /:city/* routes
  app.use('/api/:city', validateCity);

  // Stricter rate limit for bootstrap (heavy payload) — skip in dev
  if (!isDev) {
    const bootstrapLimit = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
    app.use('/api/:city/bootstrap', bootstrapLimit);
  }

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
  app.use('/api', cacheFor(43200), createPopulationRouter(cache, db));
  app.use('/api', cacheFor(43200), createFeuerwehrRouter(cache, db));
  app.use('/api', cacheFor(43200), createPollenRouter(cache, db));
  app.use('/api', cacheFor(300), createNoiseSensorsRouter(cache, db));
  app.use('/api', cacheFor(3600), createCouncilMeetingsRouter(cache, db));

  return { app, cache, db, scheduler };
}
