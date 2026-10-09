-- T1: enable pgvector extension (required by T10 embeddings vector(1024) column).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "id_migrations" (
	"legacy_id" text PRIMARY KEY NOT NULL,
	"new_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
