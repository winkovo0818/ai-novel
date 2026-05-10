-- Optimistic-lock counter for ChapterDraft. Bumped on PATCH and on restore
-- so that two tabs / devices editing the same chapter detect conflicts
-- instead of silently overwriting each other.
ALTER TABLE "ChapterDraft" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
