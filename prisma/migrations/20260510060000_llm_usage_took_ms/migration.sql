-- Add round-trip latency column for the generation history page. Null for
-- rows created before the column existed.
ALTER TABLE "LlmUsage" ADD COLUMN "took_ms" INTEGER;

-- Composite index for /novels/:id/generations time-ordered queries.
CREATE INDEX "LlmUsage_novel_id_created_at_idx" ON "LlmUsage"("novel_id", "created_at");
