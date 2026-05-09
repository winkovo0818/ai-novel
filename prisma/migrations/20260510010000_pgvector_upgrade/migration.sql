-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add a content_hash column for dirty tracking
ALTER TABLE "MemoryChunk" ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE "MemoryChunk" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

-- Convert embedding column from Float[] (DOUBLE PRECISION[]) to vector(1024)
-- Step 1: Add new column with vector type
ALTER TABLE "MemoryChunk" ADD COLUMN embedding_vector vector(1024);

-- Step 2: Migrate existing data (convert float array to vector)
-- This works because PostgreSQL can cast DOUBLE PRECISION[] to vector
UPDATE "MemoryChunk"
SET embedding_vector = embedding::vector
WHERE embedding IS NOT NULL AND array_length(embedding, 1) = 1024;

-- Step 3: Drop old column and rename
ALTER TABLE "MemoryChunk" DROP COLUMN embedding;
ALTER TABLE "MemoryChunk" RENAME COLUMN embedding_vector TO embedding;

-- Create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS "MemoryChunk_embedding_hnsw_idx"
  ON "MemoryChunk" USING hnsw (embedding vector_cosine_ops);