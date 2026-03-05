-- Consolidate 21 snapshot tables into 1 unified "snapshots" table.
-- No data migration: cron jobs repopulate within hours.

CREATE TABLE "snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "city_id" text NOT NULL,
  "type" text NOT NULL,
  "data" jsonb NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "snapshots_city_type_fetched_idx" ON "snapshots" USING btree ("city_id","type","fetched_at");
--> statement-breakpoint
DROP TABLE "weather_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "water_level_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "appointment_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "budget_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "construction_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "traffic_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "pharmacy_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "aed_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "social_atlas_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "wastewater_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "bathing_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "labor_market_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "population_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "feuerwehr_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "pollen_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "noise_sensor_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "council_meeting_snapshots" CASCADE;
--> statement-breakpoint
DROP TABLE "transit_disruptions" CASCADE;
--> statement-breakpoint
DROP TABLE "air_quality_grid" CASCADE;
--> statement-breakpoint
DROP TABLE "nina_warnings" CASCADE;
--> statement-breakpoint
DROP TABLE "political_districts" CASCADE;
