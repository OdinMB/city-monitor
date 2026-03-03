CREATE TABLE "aed_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"locations" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"headline_hash" text NOT NULL,
	"summary" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "air_quality_grid" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"european_aqi" integer NOT NULL,
	"station" text NOT NULL,
	"url" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"services" jsonb NOT NULL,
	"booking_url" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bathing_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"spots" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "construction_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"sites" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"title" text NOT NULL,
	"venue" text,
	"date" timestamp NOT NULL,
	"end_date" timestamp,
	"category" text,
	"url" text,
	"description" text,
	"free" boolean,
	"hash" text NOT NULL,
	"source" text DEFAULT 'kulturdaten' NOT NULL,
	"price" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geocode_lookups" (
	"id" serial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"display_name" text NOT NULL,
	"provider" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labor_market_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"hash" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"tier" integer NOT NULL,
	"lang" text NOT NULL,
	"relevant_to_city" boolean,
	"importance" real,
	"lat" real,
	"lon" real,
	"location_label" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nina_warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"warning_id" text NOT NULL,
	"version" integer NOT NULL,
	"source" text NOT NULL,
	"severity" text NOT NULL,
	"headline" text NOT NULL,
	"description" text,
	"instruction" text,
	"start_date" timestamp NOT NULL,
	"expires_at" timestamp,
	"area" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"pharmacies" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "political_districts" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"level" text NOT NULL,
	"districts" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"published_at" timestamp,
	"url" text,
	"district" text,
	"lat" real,
	"lon" real,
	"location_label" text,
	"hash" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_atlas_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"geojson" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"incidents" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transit_disruptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"external_id" text,
	"line" text NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"detail" text,
	"station" text,
	"lat" real,
	"lon" real,
	"affected_stops" jsonb,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"resolved" boolean DEFAULT false,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wastewater_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "water_level_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"stations" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"current" jsonb NOT NULL,
	"hourly" jsonb NOT NULL,
	"daily" jsonb NOT NULL,
	"alerts" jsonb
);
--> statement-breakpoint
CREATE INDEX "aed_city_idx" ON "aed_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "summaries_city_generated_idx" ON "ai_summaries" USING btree ("city_id","generated_at");--> statement-breakpoint
CREATE INDEX "aq_grid_city_idx" ON "air_quality_grid" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "appointment_city_idx" ON "appointment_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "bathing_city_idx" ON "bathing_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "budget_city_idx" ON "budget_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "construction_city_idx" ON "construction_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "events_city_date_idx" ON "events" USING btree ("city_id","date");--> statement-breakpoint
CREATE INDEX "events_city_source_idx" ON "events" USING btree ("city_id","source","date");--> statement-breakpoint
CREATE UNIQUE INDEX "geocode_query_idx" ON "geocode_lookups" USING btree ("query");--> statement-breakpoint
CREATE INDEX "labor_market_city_idx" ON "labor_market_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "news_city_idx" ON "news_items" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "nina_city_idx" ON "nina_warnings" USING btree ("city_id","start_date");--> statement-breakpoint
CREATE INDEX "pharmacy_city_idx" ON "pharmacy_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE UNIQUE INDEX "political_city_level_idx" ON "political_districts" USING btree ("city_id","level");--> statement-breakpoint
CREATE INDEX "safety_city_published_idx" ON "safety_reports" USING btree ("city_id","published_at");--> statement-breakpoint
CREATE INDEX "social_atlas_city_idx" ON "social_atlas_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "traffic_city_idx" ON "traffic_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "transit_city_idx" ON "transit_disruptions" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "wastewater_city_idx" ON "wastewater_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "water_level_city_idx" ON "water_level_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "weather_city_idx" ON "weather_snapshots" USING btree ("city_id");