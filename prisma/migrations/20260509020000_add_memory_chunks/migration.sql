-- Add MemoryChunk for RAG / hybrid search
CREATE TABLE "MemoryChunk" (
    "id" TEXT NOT NULL,
    "novel_id" TEXT NOT NULL,
    "chapter_id" TEXT,
    "chunk_type" TEXT NOT NULL DEFAULT 'scene',
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemoryChunk_novel_id_idx" ON "MemoryChunk"("novel_id");
CREATE INDEX "MemoryChunk_novel_id_chunk_type_idx" ON "MemoryChunk"("novel_id", "chunk_type");
CREATE INDEX "MemoryChunk_chapter_id_idx" ON "MemoryChunk"("chapter_id");

ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
