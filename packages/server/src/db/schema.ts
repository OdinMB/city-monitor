/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Drizzle ORM schema definitions.
 * Tables are added incrementally by each milestone.
 */

import { pgTable, serial, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

// Milestone 06 — Weather
export const weatherSnapshots = pgTable('weather_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  current: jsonb('current').notNull(),
  hourly: jsonb('hourly').notNull(),
  daily: jsonb('daily').notNull(),
  alerts: jsonb('alerts'),
});

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
});
