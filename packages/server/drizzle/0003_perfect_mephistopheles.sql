CREATE TABLE "feuerwehr_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pollen_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feuerwehr_city_idx" ON "feuerwehr_snapshots" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "pollen_city_idx" ON "pollen_snapshots" USING btree ("city_id");