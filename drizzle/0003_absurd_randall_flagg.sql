CREATE TABLE "ai_answer_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sources" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_daily_usage" (
	"day_key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_answer_cache_expires_idx" ON "ai_answer_cache" USING btree ("expires_at");