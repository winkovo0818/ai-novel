-- Add observable metadata for RAG memory chunks.
-- Defaults make existing rows safe: historical chunks are treated as
-- chapter-sourced, normal-importance memories until retrieval updates
-- last_used_at.

ALTER TABLE "MemoryChunk"
  ADD COLUMN IF NOT EXISTS "importance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS "source_kind" TEXT NOT NULL DEFAULT 'chapter',
  ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "MemoryChunk_novel_id_source_kind_idx"
  ON "MemoryChunk"("novel_id", "source_kind");

CREATE INDEX IF NOT EXISTS "MemoryChunk_novel_id_last_used_at_idx"
  ON "MemoryChunk"("novel_id", "last_used_at");
