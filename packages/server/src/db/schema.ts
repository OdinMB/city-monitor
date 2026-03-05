/**
 * Drizzle ORM schema definitions.
 * Tables are added incrementally by each milestone.
 */

import { pgTable, serial, text, timestamp, jsonb, integer, boolean, real, index, uniqueIndex } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Unified snapshots table — replaces 21 individual snapshot/batch tables
// Type values identify the concrete data source (not the category).
// ---------------------------------------------------------------------------

export const SNAPSHOT_TYPES = [
  'open-meteo', 'pegelonline', 'service-berlin', 'berlin-haushalt',
  'viz-roadworks', 'tomtom-traffic', 'aponet', 'osm-aeds',
  'mss-social-atlas', 'lageso-wastewater', 'lageso-bathing',
  'ba-labor-market', 'afstat-population', 'bf-feuerwehr',
  'dwd-pollen', 'sc-dnms', 'oparl-meetings',
  'vbb-disruptions', 'aqi-grid', 'bbk-nina',
  'abgwatch-bezirke', 'abgwatch-bundestag', 'abgwatch-state', 'abgwatch-state-bezirke',
] as const;
export type SnapshotType = typeof SNAPSHOT_TYPES[number];

export const snapshots = pgTable('snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  type: text('type').notNull(),
  data: jsonb('data').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('snapshots_city_type_fetched_idx').on(table.cityId, table.type, table.fetchedAt),
]);

// ---------------------------------------------------------------------------
// Hash-keyed accumulation tables (kept as-is)
// ---------------------------------------------------------------------------

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
