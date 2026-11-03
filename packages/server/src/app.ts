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
import { createHeatReliefRouter } from './routes/heat-relief.js';
import { createAppointmentsRouter } from './routes/appointments.js';
import { createWaterLevelsRouter } from './routes/water-levels.js';
import { createWaterTemperatureRouter } from './routes/water-temperature.js';
import { createBudgetRouter } from './routes/budget.js';
import { createBathingRouter } from './routes/bathing.js';
import { createLiftOutagesRouter } from './routes/lift-outages.js';
import { createBikeSharingRouter } from './routes/bike-sharing.js';
import { createParkingRouter } from './routes/parking.js';
import { createElectricityRouter } from './routes/electricity.js';
import { createCitizenReportsRouter } from './routes/citizen-reports.js';
import { createTrafficAccidentsRouter } from './routes/traffic-accidents.js';
import { createTrafficCountsRouter } from './routes/traffic-counts.js';
import { createEvChargingRouter } from './routes/ev-charging.js';
import { createSoilMoistureRouter } from './routes/soil-moisture.js';
import { createTelraamCountsRouter } from './routes/telraam-counts.js';
import { createElectionResultsRouter } from './routes/election-results.js';
import { createWastewaterRouter } from './routes/wastewater.js';
import { createRespiratoryCasesRouter } from './routes/respiratory-cases.js';
import { createLaborMarketRouter } from './routes/labor-market.js';
import { createPopulationRouter } from './routes/population.js';
import { createFeuerwehrRouter } from './routes/feuerwehr.js';
import { createPollenRouter } from './routes/pollen.js';
import { createFloodStatusRouter } from './routes/flood-status.js';
import { createAirQualityStationsRouter } from './routes/air-quality-stations.js';
import { createNoiseSensorsRouter } from './routes/noise-sensors.js';
import { createCouncilMeetingsRouter } from './routes/council-meetings.js';
import { createBootstrapRouter } from './routes/bootstrap.js';
import { createFeedIngestion } from './cron/ingest-feeds.js';
import { createWeatherIngestion } from './cron/ingest-weather.js';
import { createSummarization } from './cron/summarize.js';
import { createTransitIngestion, ingestsTransit } from './cron/ingest-transit.js';
import { createEventsIngestion } from './cron/ingest-events.js';
import { createSafetyIngestion } from './cron/ingest-safety.js';
import { createNinaIngestion } from './cron/ingest-nina.js';
import { createDataRetention } from './cron/data-retention.js';
import { createPharmacyIngestion } from './cron/ingest-pharmacies.js';
import { createTrafficIngestion } from './cron/ingest-traffic.js';
import { createPoliticalIngestion, hasParliamentConfig, preCacheBezirke } from './cron/ingest-political.js';
import { createAirQualityGridIngestion } from './cron/ingest-air-quality-grid.js';
import { createConstructionIngestion } from './cron/ingest-construction.js';
import { createAedIngestion } from './cron/ingest-aeds.js';
import { createSocialAtlasIngestion } from './cron/ingest-social-atlas.js';
import { createHeatReliefIngestion } from './cron/ingest-heat-relief.js';
import { createWaterLevelIngestion } from './cron/ingest-water-levels.js';
import { createWaterTemperatureIngestion } from './cron/ingest-water-temperature.js';
import { createBudgetIngestion } from './cron/ingest-budget.js';
import { createAppointmentIngestion } from './cron/ingest-appointments.js';
import { createBathingIngestion } from './cron/ingest-bathing.js';
import { createLiftOutageIngestion } from './cron/ingest-lift-outages.js';
import { createBikeSharingIngestion } from './cron/ingest-bike-sharing.js';
import { createParkingIngestion } from './cron/ingest-parking.js';
import { createElectricityIngestion } from './cron/ingest-electricity.js';
import { createCitizenReportIngestion } from './cron/ingest-citizen-reports.js';
import { createTrafficAccidentIngestion } from './cron/ingest-traffic-accidents.js';
import { createTrafficCountIngestion } from './cron/ingest-traffic-counts.js';
import { createEvChargingIngestion, createEvChargingStatusIngestion } from './cron/ingest-ev-charging.js';
import { createSoilMoistureIngestion } from './cron/ingest-soil-moisture.js';
import { createTelraamCountsIngestion } from './cron/ingest-telraam-counts.js';
import { createElectionResultsIngestion } from './cron/ingest-election-results.js';
import { createWastewaterIngestion } from './cron/ingest-wastewater.js';
import { createRespiratoryCasesIngestion } from './cron/ingest-respiratory-cases.js';
import { createLaborMarketIngestion } from './cron/ingest-labor-market.js';
import { createPopulationIngestion } from './cron/ingest-population.js';
import { createFeuerwehrIngestion } from './cron/ingest-feuerwehr.js';
import { createPollenIngestion } from './cron/ingest-pollen.js';
import { createFloodStatusIngestion } from './cron/ingest-flood-status.js';
import { createUbaAirQualityIngestion } from './cron/ingest-uba-air-quality.js';
import { createNoiseSensorIngestion } from './cron/ingest-noise-sensors.js';
import { createCouncilMeetingIngestion } from './cron/ingest-council-meetings.js';
import { initGeocodeDb } from './lib/geocode.js';
import { validateCity } from './lib/validate-city.js';
import { getActiveCities, getCityConfig } from './config/index.js';
import type { CityConfig } from '@city-monitor/shared';

/**
 * Jobs whose source covers Berlin only (hardcoded URL, rows written under
 * 'berlin'). Their handlers return early when Berlin is not active, so they
 * also get no freshness check and no startup run then.
 */
export const BERLIN_ONLY_JOBS: ReadonlySet<string> = new Set([
  'ingest-feuerwehr',
]);

/**
 * A job's freshness spec as declared here. `serves` mirrors the city filter in
 * the job's handler: each active city it accepts must have a fresh row, so a
 * newly activated city gets its data at startup. Keep the two in step.
 */
type JobFreshnessSpec = Omit<FreshnessSpec, 'cityIds'> & { serves?: (city: CityConfig) => boolean };

const inBerlin = (city: CityConfig) => city.id === 'berlin';
const inGermany = (city: CityConfig) => city.country === 'DE';
const hasFeeds = (city: CityConfig) => city.feeds.length > 0;

/**
 * Express `trust proxy` as a hop count: req.ip, which the rate limits count
 * by, is the X-Forwarded-For entry this many places from the right (0: the
 * socket). Measured on Render on 2026-10-26 with a forged X-Forwarded-For: 2
 * on https://api.citymonitor.app and https://city-monitor-api.onrender.com,
 * 3 through the static site's /api/* rewrite. The web app calls
 * api.citymonitor.app directly, so real traffic takes the 2-hop path;
 * requests still arriving through the rewrite count one hop too low and share
 * a proxy's bucket. See .context/deployment.md.
 */
const TRUST_PROXY_HOPS = 2;

/**
 * Browser origins allowed to call the API (CORS) when ALLOWED_ORIGINS is
 * unset: the production site's own addresses.
 */
const DEFAULT_ALLOWED_ORIGINS = 'https://citymonitor.app,https://www.citymonitor.app,https://city-monitor-web.onrender.com';

export async function createApp(options?: {
  skipScheduler?: boolean;
  /**
   * Synthetic dev mode (dev-synthetic.ts): serve the database as seeded. No cron
   * jobs, no startup refresh, no radar fetches, no hardcoded political names.
   */
  synthetic?: boolean;
}) {
  const synthetic = options?.synthetic ?? false;
  const app = express();
  app.set('trust proxy', TRUST_PROXY_HOPS); // Render's proxies
  app.use(compression());
  app.use(helmet());

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
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
  // No route reads a request body. Refuse compressed bodies (415) instead of
  // decompressing them, and cap the rest at 10kb (413).
  app.use(express.json({ inflate: false, limit: '10kb' }));

  const cache = createCache();
  const dbResult = createDb();
  const db = dbResult?.db ?? null;

  if (db) {
    await testConnection(db);
    initGeocodeDb(db);
    await warmCache(db, cache);
  }

  // Pre-cache hardcoded political data so it's available before cron jobs finish
  if (!synthetic) preCacheBezirke(cache);

  // Check which domains have stale/missing data and need a startup refresh.
  // Max age is roughly the cron interval — data older than that is overdue.
  const FRESHNESS_SPECS: JobFreshnessSpec[] = [
    // Non-snapshot tables
    { jobName: 'ingest-feeds',        tableName: 'news_items',    maxAgeSeconds: 3600, serves: hasFeeds },
    { jobName: 'summarize-news',      tableName: 'ai_summaries',  maxAgeSeconds: 21600, timestampColumn: 'generated_at', serves: hasFeeds },
    { jobName: 'ingest-events',       tableName: 'events',        maxAgeSeconds: 21600, serves: (c) => !!c.dataSources.events?.length },
    { jobName: 'ingest-safety',       tableName: 'safety_reports', maxAgeSeconds: 600, serves: (c) => !!c.dataSources.police },

    // Unified snapshots table (with type filter — values are concrete data source names)
    { jobName: 'ingest-weather',      tableName: 'snapshots', maxAgeSeconds: 3600,    filter: { column: 'type', value: 'open-meteo' }, serves: (c) => c.dataSources.weather.provider === 'brightsky' },
    { jobName: 'ingest-transit',      tableName: 'snapshots', maxAgeSeconds: 900,     filter: { column: 'type', value: 'vbb-disruptions' }, serves: (c) => ingestsTransit(c) },
    { jobName: 'ingest-nina',         tableName: 'snapshots', maxAgeSeconds: 300,     filter: { column: 'type', value: 'bbk-nina' }, serves: (c) => inGermany(c) && !!c.dataSources.nina },
    { jobName: 'ingest-pharmacies',   tableName: 'snapshots', maxAgeSeconds: 21600,   filter: { column: 'type', value: 'aponet' }, serves: inGermany },
    { jobName: 'ingest-traffic',      tableName: 'snapshots', maxAgeSeconds: 300,     filter: { column: 'type', value: 'tomtom-traffic' }, serves: () => true },
    { jobName: 'ingest-political',    tableName: 'snapshots', maxAgeSeconds: 604800,  filter: { column: 'type', value: 'abgwatch-bundestag' }, serves: hasParliamentConfig },
    // No spec for ingest-aq-grid: it runs on every start (see the job list)
    { jobName: 'ingest-uba-air-quality', tableName: 'snapshots', maxAgeSeconds: 3600, filter: { column: 'type', value: 'uba-airquality' }, serves: (c) => !!c.dataSources.airQuality?.ubaStations?.length },
    { jobName: 'ingest-construction', tableName: 'snapshots', maxAgeSeconds: 1800,    filter: { column: 'type', value: 'viz-roadworks' }, serves: (c) => !!c.dataSources.roadworks },
    { jobName: 'ingest-aeds',         tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'osm-aeds' }, serves: inGermany },
    { jobName: 'ingest-social-atlas', tableName: 'snapshots', maxAgeSeconds: 604800,  filter: { column: 'type', value: 'mss-social-atlas' }, serves: (c) => !!c.dataSources.socialAtlas },
    { jobName: 'ingest-heat-relief',  tableName: 'snapshots', maxAgeSeconds: 604800,  filter: { column: 'type', value: 'heat-relief' }, serves: (c) => !!c.dataSources.heatRelief?.length },
    { jobName: 'ingest-water-levels', tableName: 'snapshots', maxAgeSeconds: 900,     filter: { column: 'type', value: 'pegelonline' }, serves: (c) => !!c.dataSources.waterLevels?.stations.length },
    { jobName: 'ingest-water-temperature', tableName: 'snapshots', maxAgeSeconds: 900, filter: { column: 'type', value: 'wasserportal-temp' }, serves: (c) => !!c.dataSources.waterTemperature?.stations.length },
    { jobName: 'ingest-flood-status', tableName: 'snapshots', maxAgeSeconds: 300,     filter: { column: 'type', value: 'lhp-flood' }, serves: (c) => !!c.dataSources.floodStatus?.stations.length },
    { jobName: 'ingest-budget',       tableName: 'snapshots', maxAgeSeconds: 86400,  filter: { column: 'type', value: 'berlin-haushalt' }, serves: (c) => !!c.dataSources.budget },
    // No `serves`: table-wide, so a fresh row of any city skips the startup run.
    // Its Firecrawl calls are paid; a city added without rows must not add one.
    { jobName: 'ingest-appointments', tableName: 'snapshots', maxAgeSeconds: 43200,   filter: { column: 'type', value: 'service-berlin' } },
    // The type is lageso-bathing for every provider, as viz-roadworks is for every roadworks feed
    { jobName: 'ingest-bathing',      tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'lageso-bathing' }, serves: (c) => !!c.dataSources.bathing },
    { jobName: 'ingest-lift-outages', tableName: 'snapshots', maxAgeSeconds: 900,     filter: { column: 'type', value: 'kvb-lift-outages' }, serves: (c) => !!c.dataSources.liftOutages },
    // 30 min: the job stores a row that often (BIKE_SHARING_DB_INTERVAL_MS), though it runs every 5
    { jobName: 'ingest-bike-sharing', tableName: 'snapshots', maxAgeSeconds: 1800,    filter: { column: 'type', value: 'bike-sharing' }, serves: (c) => !!c.dataSources.bikeSharing },
    // 15 min: the job stores a row that often (PARKING_DB_INTERVAL_MS), though it runs every 5
    { jobName: 'ingest-parking',      tableName: 'snapshots', maxAgeSeconds: 900,     filter: { column: 'type', value: 'parking' }, serves: (c) => !!c.dataSources.parking },
    { jobName: 'ingest-electricity',  tableName: 'snapshots', maxAgeSeconds: 900,     filter: { column: 'type', value: 'smard-electricity' }, serves: (c) => !!c.dataSources.electricity },
    { jobName: 'ingest-citizen-reports', tableName: 'snapshots', maxAgeSeconds: 900, filter: { column: 'type', value: 'open311-reports' }, serves: (c) => !!c.dataSources.citizenReports },
    { jobName: 'ingest-soil-moisture', tableName: 'snapshots', maxAgeSeconds: 43200, filter: { column: 'type', value: 'dwd-soil-moisture' }, serves: (c) => (c.dataSources.soilMoisture?.stations.length ?? 0) > 0 },
    { jobName: 'ingest-wastewater',   tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'lageso-wastewater' }, serves: (c) => !!c.dataSources.wastewater },
    // 2 h: the counts are hourly, and a row is stored when a new hour comes in
    { jobName: 'ingest-traffic-counts', tableName: 'snapshots', maxAgeSeconds: 7200,  filter: { column: 'type', value: 'traffic-counts' }, serves: (c) => !!c.dataSources.trafficCounts },
    // Weekly job on a monthly register. No spec for ingest-ev-charging-status: cache only, it runs on every start
    { jobName: 'ingest-ev-charging',  tableName: 'snapshots', maxAgeSeconds: 604800,  filter: { column: 'type', value: 'bnetza-charging' }, serves: (c) => !!c.dataSources.evCharging },
    { jobName: 'ingest-respiratory-cases', tableName: 'snapshots', maxAgeSeconds: 86400, filter: { column: 'type', value: 'rki-ifsg-cases' }, serves: (c) => !!c.dataSources.respiratoryCases },
    { jobName: 'ingest-labor-market', tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'ba-labor-market' }, serves: (c) => !!c.dataSources.laborMarket },
    { jobName: 'ingest-population',   tableName: 'snapshots', maxAgeSeconds: 2592000, filter: { column: 'type', value: 'afstat-population' }, serves: (c) => !!c.dataSources.population },
    { jobName: 'ingest-traffic-accidents', tableName: 'snapshots', maxAgeSeconds: 2592000, filter: { column: 'type', value: 'unfallatlas-accidents' }, serves: (c) => !!c.dataSources.trafficAccidents },
    // A day: each run counts yesterday, so a row from before today's first run is a day behind
    { jobName: 'ingest-telraam-counts', tableName: 'snapshots', maxAgeSeconds: 86400, filter: { column: 'type', value: 'telraam-counts' }, serves: (c) => !!c.dataSources.telraamCounts },
    { jobName: 'ingest-election-results', tableName: 'snapshots', maxAgeSeconds: 2592000, filter: { column: 'type', value: 'election-results' }, serves: (c) => !!c.dataSources.electionResults },
    { jobName: 'ingest-feuerwehr',    tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'bf-feuerwehr' }, serves: inBerlin },
    { jobName: 'ingest-pollen',       tableName: 'snapshots', maxAgeSeconds: 86400,   filter: { column: 'type', value: 'dwd-pollen' }, serves: (c) => !!c.dataSources.pollen },
    { jobName: 'ingest-noise-sensors', tableName: 'snapshots', maxAgeSeconds: 1800,   filter: { column: 'type', value: 'sc-dnms' }, serves: (c) => !!c.dataSources.noiseSensors },
    { jobName: 'ingest-council-meetings', tableName: 'snapshots', maxAgeSeconds: 21600, filter: { column: 'type', value: 'oparl-meetings' }, serves: (c) => !!c.dataSources.councilMeetings },
  ];

  const activeCities = getActiveCities();
  const berlinActive = getCityConfig('berlin') !== undefined;
  const freshnessSpecs: FreshnessSpec[] = FRESHNESS_SPECS
    .filter((spec) => berlinActive || !BERLIN_ONLY_JOBS.has(spec.jobName))
    .map(({ serves, ...spec }) => (serves ? { ...spec, cityIds: activeCities.filter(serves).map((c) => c.id) } : spec));

  const stale = synthetic
    ? new Set<string>() // synthetic mode never refreshes
    : db
      ? await findStaleJobs(db, freshnessSpecs)
      : new Set(freshnessSpecs.map((s) => s.jobName)); // no DB = refresh everything

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
  const ingestUbaAirQuality = createUbaAirQualityIngestion(cache, db);
  const ingestConstruction = createConstructionIngestion(cache, db);
  const ingestAeds = createAedIngestion(cache, db);
  const ingestSocialAtlas = createSocialAtlasIngestion(cache, db);
  const ingestHeatRelief = createHeatReliefIngestion(cache, db);
  const ingestWaterLevels = createWaterLevelIngestion(cache, db);
  const ingestWaterTemperature = createWaterTemperatureIngestion(cache, db);
  const ingestFloodStatus = createFloodStatusIngestion(cache, db);
  const ingestBudget = createBudgetIngestion(cache, db);
  const ingestAppointments = createAppointmentIngestion(cache, db);
  const ingestBathing = createBathingIngestion(cache, db);
  const ingestLiftOutages = createLiftOutageIngestion(cache, db);
  const ingestBikeSharing = createBikeSharingIngestion(cache, db);
  const ingestParking = createParkingIngestion(cache, db);
  const ingestElectricity = createElectricityIngestion(cache, db);
  const ingestCitizenReports = createCitizenReportIngestion(cache, db);
  const ingestTrafficAccidents = createTrafficAccidentIngestion(cache, db);
  const ingestTrafficCounts = createTrafficCountIngestion(cache, db);
  const ingestEvCharging = createEvChargingIngestion(cache, db);
  const ingestEvChargingStatus = createEvChargingStatusIngestion(cache);
  const ingestSoilMoisture = createSoilMoistureIngestion(cache, db);
  const ingestTelraamCounts = createTelraamCountsIngestion(cache, db);
  const ingestElectionResults = createElectionResultsIngestion(cache, db);
  const ingestWastewater = createWastewaterIngestion(cache, db);
  const ingestRespiratoryCases = createRespiratoryCasesIngestion(cache, db);
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
    { name: 'ingest-weather', schedule: '0 * * * *', handler: ingestWeather, runOnStart: s('ingest-weather') },
    { name: 'ingest-transit', schedule: '*/15 * * * *', handler: ingestTransit, runOnStart: s('ingest-transit') },
    { name: 'ingest-events', schedule: '0 */6 * * *', handler: ingestEvents, runOnStart: s('ingest-events') },
    { name: 'ingest-safety', schedule: '*/10 * * * *', handler: ingestSafety, runOnStart: s('ingest-safety') },
    { name: 'ingest-nina', schedule: '*/5 * * * *', handler: ingestNina, runOnStart: s('ingest-nina') },
    { name: 'ingest-pharmacies', schedule: '0 */6 * * *', handler: ingestPharmacies, runOnStart: s('ingest-pharmacies') },
    { name: 'ingest-traffic', schedule: '*/5 * * * *', handler: ingestTraffic, runOnStart: s('ingest-traffic') },
    { name: 'ingest-political', schedule: '0 4 * * 1', handler: ingestPolitical, runOnStart: s('ingest-political') },
    // Always on start: the stored grid holds no WAQI stations (WAQI's terms
    // forbid archiving them), so a fresh row cannot stand in for a run.
    { name: 'ingest-aq-grid', schedule: '*/30 * * * *', handler: ingestAqGrid, runOnStart: true },
    // UBA publishes each hour one to two hours late, not at a fixed minute
    { name: 'ingest-uba-air-quality', schedule: '10,40 * * * *', handler: ingestUbaAirQuality, runOnStart: s('ingest-uba-air-quality') },
    { name: 'ingest-construction', schedule: '*/30 * * * *', handler: ingestConstruction, runOnStart: s('ingest-construction') },
    { name: 'ingest-aeds', schedule: '0 0 * * *', handler: ingestAeds, runOnStart: s('ingest-aeds') },
    { name: 'ingest-social-atlas', schedule: '0 5 * * 0', handler: ingestSocialAtlas, runOnStart: s('ingest-social-atlas') },
    // Static lists (cool places, fountains, toilets) that change a few times a year
    { name: 'ingest-heat-relief', schedule: '30 5 * * 1', handler: ingestHeatRelief, runOnStart: s('ingest-heat-relief') },
    { name: 'ingest-water-levels', schedule: '*/15 * * * *', handler: ingestWaterLevels, runOnStart: s('ingest-water-levels') },
    // The Wasserportal's online stations send 15-minute values; off the quarter hour so the newest has landed
    { name: 'ingest-water-temperature', schedule: '4,19,34,49 * * * *', handler: ingestWaterTemperature, runOnStart: s('ingest-water-temperature') },
    // LHP's terms ask for a refresh at least every 10 minutes
    { name: 'ingest-flood-status', schedule: '*/5 * * * *', handler: ingestFloodStatus, runOnStart: s('ingest-flood-status') },
    { name: 'ingest-budget', schedule: '0 6 * * *', handler: ingestBudget, runOnStart: s('ingest-budget') },
    { name: 'ingest-appointments', schedule: '0 6,18 * * *', handler: ingestAppointments, runOnStart: s('ingest-appointments') },
    { name: 'ingest-bathing', schedule: '0 6 * * *', handler: ingestBathing, runOnStart: s('ingest-bathing') },
    // KVB updates its outage lists about every 15 minutes
    { name: 'ingest-lift-outages', schedule: '*/15 * * * *', handler: ingestLiftOutages, runOnStart: s('ingest-lift-outages') },
    // GBFS updates every 60 s; the store gets a row at most every 30 min (BIKE_SHARING_DB_INTERVAL_MS)
    { name: 'ingest-bike-sharing', schedule: '*/5 * * * *', handler: ingestBikeSharing, runOnStart: s('ingest-bike-sharing') },
    // Hamburg's Parkleitsystem reports every 5 minutes; the store gets a row at most every 15 (PARKING_DB_INTERVAL_MS)
    { name: 'ingest-parking', schedule: '1-59/5 * * * *', handler: ingestParking, runOnStart: s('ingest-parking') },
    // SMARD and Energy-Charts publish quarter-hours; minute 2 of each lets the newest one land.
    // Energy-Charts allows about 2 requests per minute per endpoint: one call each per run.
    { name: 'ingest-electricity', schedule: '2,17,32,47 * * * *', handler: ingestElectricity, runOnStart: s('ingest-electricity') },
    // Citizen reports: the last fortnight every 15 min, off the quarter hour, paged gently
    { name: 'ingest-citizen-reports', schedule: '7,22,37,52 * * * *', handler: ingestCitizenReports, runOnStart: s('ingest-citizen-reports') },
    // Hourly counts that arrive over one to two hours: every 15 min picks up a new hour soon after most counters have it
    { name: 'ingest-traffic-counts', schedule: '*/15 * * * *', handler: ingestTrafficCounts, runOnStart: s('ingest-traffic-counts') },
    // The BNetzA register is monthly (a 55 MB CSV); a weekly look picks up a new edition within days
    { name: 'ingest-ev-charging', schedule: '30 4 * * 3', handler: ingestEvCharging, runOnStart: s('ingest-ev-charging') },
    // Hamburg's live charge-point status, not stored, so always on start
    { name: 'ingest-ev-charging-status', schedule: '*/5 * * * *', handler: ingestEvChargingStatus, runOnStart: true },
    // The DWD regenerates its soil files once a day, around 09:00 UTC; the afternoon run catches a late one
    { name: 'ingest-soil-moisture', schedule: '30 10,16 * * *', handler: ingestSoilMoisture, runOnStart: s('ingest-soil-moisture') },
    { name: 'ingest-wastewater', schedule: '0 6 * * *', handler: ingestWastewater, runOnStart: s('ingest-wastewater') },
    // The RKI overwrites both files once a week (data cut Wednesday 0:00); a daily run picks them up within a day
    { name: 'ingest-respiratory-cases', schedule: '15 6 * * *', handler: ingestRespiratoryCases, runOnStart: s('ingest-respiratory-cases') },
    { name: 'ingest-labor-market', schedule: '0 7 * * *', handler: ingestLaborMarket, runOnStart: s('ingest-labor-market') },
    { name: 'ingest-population', schedule: '0 6 1 * *', handler: ingestPopulation, runOnStart: s('ingest-population'), dependsOn: ['ingest-social-atlas'] },
    // The Unfallatlas publishes one year each July: a monthly run picks it up within weeks
    { name: 'ingest-traffic-accidents', schedule: '0 5 2 * *', handler: ingestTrafficAccidents, runOnStart: s('ingest-traffic-accidents') },
    // Berlin zählt Mobilität rebuilds its files at about 02:15 local time; the second run catches a late night
    { name: 'ingest-telraam-counts', schedule: '25 4,11 * * *', handler: ingestTelraamCounts, runOnStart: s('ingest-telraam-counts') },
    // Final election results change only with a correction: monthly is plenty
    { name: 'ingest-election-results', schedule: '30 5 3 * *', handler: ingestElectionResults, runOnStart: s('ingest-election-results') },
    { name: 'ingest-feuerwehr', schedule: '0 8 * * *', handler: ingestFeuerwehr, runOnStart: s('ingest-feuerwehr') },
    { name: 'ingest-pollen', schedule: '0 */6 * * *', handler: ingestPollen, runOnStart: s('ingest-pollen') },
    { name: 'ingest-noise-sensors', schedule: '*/10 * * * *', handler: ingestNoiseSensors, runOnStart: s('ingest-noise-sensors') },
    { name: 'ingest-council-meetings', schedule: '0 */6 * * *', handler: ingestCouncilMeetings, runOnStart: s('ingest-council-meetings') },
    { name: 'data-retention', schedule: '0 3 * * *', handler: retainData },
  ];

  const scheduler = options?.skipScheduler || synthetic
    ? { getJobs: () => [] as JobInfo[], stop: () => {}, triggerJob: async () => false as boolean }
    : createScheduler(jobs);

  // Cache-Control per route tier (max-age < cron interval)
  const cacheFor = (seconds: number): express.RequestHandler =>
    (_req, res, next) => { res.set('Cache-Control', `public, max-age=${seconds}`); next(); };

  // Non-city routes (mounted before validateCity so /api/health, /api/weather-tiles aren't rejected)
  app.use('/api', createHealthRouter(cache, scheduler));
  // The tiles router fetches RainViewer as soon as it is created
  if (!synthetic) app.use('/api', cacheFor(300), createWeatherTilesRouter());

  // Validate :city param on all /:city/* routes
  app.use('/api/:city', validateCity);

  // Stricter rate limit for bootstrap (heavy payload) — skip in dev
  if (!isDev) {
    const bootstrapLimit = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
    app.use('/api/:city/bootstrap', bootstrapLimit);

    // Stricter rate limit for heavy payloads (GeoJSON, large data objects)
    const heavyPayloadLimit = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
    app.use('/api/:city/social-atlas', heavyPayloadLimit);
    app.use('/api/:city/heat-relief', heavyPayloadLimit);
    app.use('/api/:city/population', heavyPayloadLimit);
    app.use('/api/:city/aeds', heavyPayloadLimit);
    app.use('/api/:city/bike-sharing', heavyPayloadLimit);
    app.use('/api/:city/traffic-accidents', heavyPayloadLimit);
    app.use('/api/:city/traffic-counts', heavyPayloadLimit);
    app.use('/api/:city/ev-charging', heavyPayloadLimit);
    app.use('/api/:city/election-results', heavyPayloadLimit);
    app.use('/api/:city/budget', heavyPayloadLimit);
  }

  app.use('/api', cacheFor(60), createBootstrapRouter(cache));
  app.use('/api', cacheFor(300), createNewsRouter(cache, db));
  app.use('/api', cacheFor(300), createWeatherRouter(cache, db));
  app.use('/api', cacheFor(120), createTransitRouter(cache, db));
  app.use('/api', cacheFor(1800), createEventsRouter(cache, db));
  app.use('/api', cacheFor(300), createSafetyRouter(cache, db));
  app.use('/api', cacheFor(120), createNinaRouter(cache, db));
  app.use('/api', cacheFor(600), createAirQualityRouter(cache, db));
  app.use('/api', cacheFor(600), createAirQualityStationsRouter(cache, db));
  app.use('/api', cacheFor(3600), createPharmaciesRouter(cache, db));
  app.use('/api', cacheFor(120), createTrafficRouter(cache, db));
  app.use('/api', cacheFor(900), createConstructionRouter(cache, db));
  app.use('/api', cacheFor(43200), createAedsRouter(cache, db));
  app.use('/api', cacheFor(43200), createSocialAtlasRouter(cache, db));
  app.use('/api', cacheFor(43200), createHeatReliefRouter(cache, db));
  app.use('/api', cacheFor(300), createWaterLevelsRouter(cache, db));
  app.use('/api', cacheFor(300), createWaterTemperatureRouter(cache, db));
  app.use('/api', cacheFor(120), createFloodStatusRouter(cache, db));
  app.use('/api', cacheFor(3600), createPoliticalRouter(cache, db));
  app.use('/api', cacheFor(3600), createBudgetRouter(cache, db));
  app.use('/api', cacheFor(3600), createAppointmentsRouter(cache, db));
  app.use('/api', cacheFor(43200), createBathingRouter(cache, db));
  app.use('/api', cacheFor(300), createLiftOutagesRouter(cache, db));
  app.use('/api', cacheFor(120), createBikeSharingRouter(cache, db));
  app.use('/api', cacheFor(120), createParkingRouter(cache, db));
  app.use('/api', cacheFor(300), createElectricityRouter(cache, db));
  app.use('/api', cacheFor(300), createCitizenReportsRouter(cache, db));
  app.use('/api', cacheFor(300), createTrafficCountsRouter(cache, db));
  // Short for Hamburg's live status (every 5 min); the register itself changes monthly
  app.use('/api', cacheFor(120), createEvChargingRouter(cache, db));
  app.use('/api', cacheFor(3600), createSoilMoistureRouter(cache, db));
  app.use('/api', cacheFor(43200), createWastewaterRouter(cache, db));
  app.use('/api', cacheFor(43200), createRespiratoryCasesRouter(cache, db));
  app.use('/api', cacheFor(3600), createLaborMarketRouter(cache, db));
  app.use('/api', cacheFor(43200), createPopulationRouter(cache, db));
  app.use('/api', cacheFor(43200), createTrafficAccidentsRouter(cache, db));
  app.use('/api', cacheFor(3600), createTelraamCountsRouter(cache, db));
  app.use('/api', cacheFor(43200), createElectionResultsRouter(cache, db));
  app.use('/api', cacheFor(43200), createFeuerwehrRouter(cache, db));
  app.use('/api', cacheFor(43200), createPollenRouter(cache, db));
  app.use('/api', cacheFor(300), createNoiseSensorsRouter(cache, db));
  app.use('/api', cacheFor(3600), createCouncilMeetingsRouter(cache, db));

  return { app, cache, db, scheduler };
}
