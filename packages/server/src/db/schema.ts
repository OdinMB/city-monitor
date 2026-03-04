/**
 * Drizzle ORM schema definitions.
 * Tables are added incrementally by each milestone.
 */

import { pgTable, serial, text, timestamp, jsonb, integer, boolean, real, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Milestone 06 — Weather
export const weatherSnapshots = pgTable('weather_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  current: jsonb('current').notNull(),
  hourly: jsonb('hourly').notNull(),
  daily: jsonb('daily').notNull(),
  alerts: jsonb('alerts'),
}, (table) => [
  index('weather_city_idx').on(table.cityId),
]);

// Milestone 09 — Transit
export const transitDisruptions = pgTable('transit_disruptions', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  externalId: text('external_id'),
  line: text('line').notNull(),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  message: text('message').notNull(),
  detail: text('detail'),
  station: text('station'),
  lat: real('lat'),
  lon: real('lon'),
  affectedStops: jsonb('affected_stops'),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  resolved: boolean('resolved').default(false),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('transit_city_idx').on(table.cityId),
]);

// Milestone 10 — Events
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  title: text('title').notNull(),
  venue: text('venue'),
  date: timestamp('date').notNull(),
  endDate: timestamp('end_date'),
  category: text('category'),
  url: text('url'),
  description: text('description'),
  free: boolean('free'),
  hash: text('hash').notNull(),
  source: text('source').notNull().default('kulturdaten'),
  price: text('price'),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('events_city_date_idx').on(table.cityId, table.date),
  index('events_city_source_idx').on(table.cityId, table.source, table.date),
  uniqueIndex('events_city_hash_idx').on(table.cityId, table.hash),
]);

// Milestone 10 — Safety Reports
export const safetyReports = pgTable('safety_reports', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  publishedAt: timestamp('published_at'),
  url: text('url'),
  district: text('district'),
  lat: real('lat'),
  lon: real('lon'),
  locationLabel: text('location_label'),
  hash: text('hash').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('safety_city_published_idx').on(table.cityId, table.publishedAt),
  uniqueIndex('safety_city_hash_idx').on(table.cityId, table.hash),
]);

// NINA civil protection warnings
export const ninaWarnings = pgTable('nina_warnings', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  warningId: text('warning_id').notNull(),
  version: integer('version').notNull(),
  source: text('source').notNull(),
  severity: text('severity').notNull(),
  headline: text('headline').notNull(),
  description: text('description'),
  instruction: text('instruction'),
  startDate: timestamp('start_date').notNull(),
  expiresAt: timestamp('expires_at'),
  area: jsonb('area'),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('nina_city_idx').on(table.cityId, table.startDate),
  uniqueIndex('nina_city_warning_version_idx').on(table.cityId, table.warningId, table.version),
]);

// News items with LLM assessments
export const newsItems = pgTable('news_items', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  hash: text('hash').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  publishedAt: timestamp('published_at'),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  tier: integer('tier').notNull(),
  lang: text('lang').notNull(),
  relevantToCity: boolean('relevant_to_city'),
  importance: real('importance'),
  lat: real('lat'),
  lon: real('lon'),
  locationLabel: text('location_label'),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('news_city_idx').on(table.cityId),
  index('news_city_published_idx').on(table.cityId, table.publishedAt),
  uniqueIndex('news_city_hash_idx').on(table.cityId, table.hash),
]);

// Geocode lookup table — persistent cache for geocoding results
export const geocodeLookups = pgTable('geocode_lookups', {
  id: serial('id').primaryKey(),
  query: text('query').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  displayName: text('display_name').notNull(),
  provider: text('provider').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('geocode_query_idx').on(table.query),
]);

// Air quality grid (WAQI + Open-Meteo supplement stations)
export const airQualityGrid = pgTable('air_quality_grid', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  europeanAqi: integer('european_aqi').notNull(),
  station: text('station').notNull(),
  url: text('url'),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('aq_grid_city_idx').on(table.cityId),
]);

// Political districts (Bezirke, Bundestag, state parliament)
export const politicalDistricts = pgTable('political_districts', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  level: text('level').notNull(), // 'bezirke' | 'bundestag' | 'state' | 'state-bezirke'
  districts: jsonb('districts').notNull(), // PoliticalDistrict[]
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('political_city_level_idx').on(table.cityId, table.level),
]);

// Water level snapshots (PEGELONLINE)
export const waterLevelSnapshots = pgTable('water_level_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  stations: jsonb('stations').notNull(), // WaterLevelStation[]
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('water_level_city_idx').on(table.cityId),
]);

// Citizen services appointment snapshots
export const appointmentSnapshots = pgTable('appointment_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  services: jsonb('services').notNull(), // BuergeramtService[]
  bookingUrl: text('booking_url').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('appointment_city_idx').on(table.cityId),
]);

// Budget snapshots
export const budgetSnapshots = pgTable('budget_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  data: jsonb('data').notNull(), // BudgetSummary
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('budget_city_idx').on(table.cityId),
]);

// Construction site snapshots
export const constructionSnapshots = pgTable('construction_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  sites: jsonb('sites').notNull(), // ConstructionSite[]
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('construction_city_idx').on(table.cityId),
]);

// Traffic incident snapshots
export const trafficSnapshots = pgTable('traffic_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  incidents: jsonb('incidents').notNull(), // TrafficIncident[]
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('traffic_city_idx').on(table.cityId),
]);

// Emergency pharmacy snapshots
export const pharmacySnapshots = pgTable('pharmacy_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  pharmacies: jsonb('pharmacies').notNull(), // EmergencyPharmacy[]
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('pharmacy_city_idx').on(table.cityId),
]);

// AED location snapshots
export const aedSnapshots = pgTable('aed_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  locations: jsonb('locations').notNull(), // AedLocation[]
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('aed_city_idx').on(table.cityId),
]);

// Social atlas GeoJSON snapshots
export const socialAtlasSnapshots = pgTable('social_atlas_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  geojson: jsonb('geojson').notNull(), // GeoJSON FeatureCollection
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('social_atlas_city_idx').on(table.cityId),
]);

// Wastewater monitoring snapshots
export const wastewaterSnapshots = pgTable('wastewater_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  data: jsonb('data').notNull(), // WastewaterSummary
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('wastewater_city_idx').on(table.cityId),
]);

// Bathing water quality snapshots
export const bathingSnapshots = pgTable('bathing_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  spots: jsonb('spots').notNull(), // BathingSpot[]
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('bathing_city_idx').on(table.cityId),
]);

// Labor market snapshots
export const laborMarketSnapshots = pgTable('labor_market_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  data: jsonb('data').notNull(), // LaborMarketSummary
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('labor_market_city_idx').on(table.cityId),
]);

// Population demographics snapshots
export const populationSnapshots = pgTable('population_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  geojson: jsonb('geojson').notNull(), // GeoJSON FeatureCollection
  summary: jsonb('summary').notNull(), // PopulationSummary
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('population_city_idx').on(table.cityId),
]);

// Feuerwehr (fire department) monthly operations snapshots
export const feuerwehrSnapshots = pgTable('feuerwehr_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  data: jsonb('data').notNull(), // FeuerwehrSummary
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('feuerwehr_city_idx').on(table.cityId),
]);

// Pollen forecast snapshots (DWD)
export const pollenSnapshots = pgTable('pollen_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  data: jsonb('data').notNull(), // PollenForecast
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('pollen_city_idx').on(table.cityId),
]);

// Milestone 07 — AI Summaries
export const aiSummaries = pgTable('ai_summaries', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  lang: text('lang').notNull().default('de'),
  headlineHash: text('headline_hash').notNull(),
  summary: text('summary').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
}, (table) => [
  index('summaries_city_generated_idx').on(table.cityId, table.generatedAt),
]);
