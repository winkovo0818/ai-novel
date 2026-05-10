-- M3.1: dirty flags on ChapterDraft. PATCH sets these true on content
-- change; summarize_chapter / index_chapter handlers clear them after a
-- successful run. Decouples "user edited" from "memory must rerun now"
-- so long novels don't pay LLM cost on every autosave keystroke.
ALTER TABLE "ChapterDraft"
  ADD COLUMN "summary_dirty" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "index_dirty"   BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any chapter whose summary or chunks are missing or older than
-- the chapter's last edit is conceptually dirty under the new scheme.
-- Without this, existing rows would stay false and the batch-flush button
-- would underreport work-to-do until the next user edit.
UPDATE "ChapterDraft" c
   SET "summary_dirty" = true
 WHERE NOT EXISTS (
     SELECT 1 FROM "ChapterSummary" s
      WHERE s."chapter_id" = c."id"
        AND s."updated_at" >= c."updated_at"
   )
   AND length(trim(c."content")) > 0;

UPDATE "ChapterDraft" c
   SET "index_dirty" = true
 WHERE NOT EXISTS (
     SELECT 1 FROM "MemoryChunk" m
      WHERE m."chapter_id" = c."id"
   )
   AND length(trim(c."content")) > 0;

-- Index for the batch-flush query (find dirty chapters for a novel).
CREATE INDEX "ChapterDraft_novel_id_summary_dirty_idx"
  ON "ChapterDraft"("novel_id", "summary_dirty");
CREATE INDEX "ChapterDraft_novel_id_index_dirty_idx"
  ON "ChapterDraft"("novel_id", "index_dirty");
