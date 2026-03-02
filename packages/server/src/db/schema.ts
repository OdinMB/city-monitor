/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Drizzle ORM schema definitions.
 * Tables are added incrementally by each milestone.
 */

import { pgTable, serial, text, timestamp, jsonb, integer, boolean, real, index } from 'drizzle-orm/pg-core';

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
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('events_city_date_idx').on(table.cityId, table.date),
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
  hash: text('hash').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  index('safety_city_published_idx').on(table.cityId, table.publishedAt),
]);

// Milestone 07 — AI Summaries
export const aiSummaries = pgTable('ai_summaries', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  headlineHash: text('headline_hash').notNull(),
  summary: text('summary').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
}, (table) => [
  index('summaries_city_generated_idx').on(table.cityId, table.generatedAt),
]);
