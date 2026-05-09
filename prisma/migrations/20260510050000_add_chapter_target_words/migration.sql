-- Add optional per-chapter word target. Null means no target set.
ALTER TABLE "ChapterDraft" ADD COLUMN "target_words" INTEGER;
