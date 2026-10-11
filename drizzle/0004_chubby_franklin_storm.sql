CREATE TABLE "github_trending_days" (
	"day_key" text PRIMARY KEY NOT NULL,
	"repos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "github_trending_days_fetched_idx" ON "github_trending_days" USING btree ("fetched_at");