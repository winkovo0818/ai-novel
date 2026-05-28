-- User feedback for retrieved RAG memories. Feedback is kept separate from
-- MemoryChunk so marking a chunk irrelevant never deletes or mutates the
-- source memory; later eval/reporting can aggregate ratings safely.

CREATE TABLE IF NOT EXISTS "MemoryFeedback" (
  "id" TEXT NOT NULL,
  "novel_id" TEXT NOT NULL,
  "memory_chunk_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "rating" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemoryFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MemoryFeedback_user_id_memory_chunk_id_key"
  ON "MemoryFeedback"("user_id", "memory_chunk_id");

CREATE INDEX IF NOT EXISTS "MemoryFeedback_novel_id_rating_idx"
  ON "MemoryFeedback"("novel_id", "rating");

CREATE INDEX IF NOT EXISTS "MemoryFeedback_memory_chunk_id_rating_idx"
  ON "MemoryFeedback"("memory_chunk_id", "rating");

CREATE INDEX IF NOT EXISTS "MemoryFeedback_user_id_novel_id_idx"
  ON "MemoryFeedback"("user_id", "novel_id");

CREATE INDEX IF NOT EXISTS "MemoryFeedback_created_at_idx"
  ON "MemoryFeedback"("created_at");

ALTER TABLE "MemoryFeedback"
  ADD CONSTRAINT "MemoryFeedback_memory_chunk_id_fkey"
  FOREIGN KEY ("memory_chunk_id") REFERENCES "MemoryChunk"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
