CREATE TABLE "noise_sensor_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "noise_sensor_city_idx" ON "noise_sensor_snapshots" USING btree ("city_id");