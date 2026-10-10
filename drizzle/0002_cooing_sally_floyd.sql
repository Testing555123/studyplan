CREATE TABLE "ebook_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"char_count" integer NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"embed_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ebook_chunks_slug_chunk_idx" ON "ebook_chunks" USING btree ("slug","chunk_index");--> statement-breakpoint
CREATE INDEX "ebook_chunks_slug_idx" ON "ebook_chunks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ebook_chunks_embedding_idx" ON "ebook_chunks" USING hnsw ("embedding" vector_cosine_ops);