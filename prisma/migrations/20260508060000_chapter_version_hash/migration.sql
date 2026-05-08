-- Add content_hash to ChapterVersion to support de-duplication of identical
-- consecutive versions and back-fill it for existing rows using md5(content).

ALTER TABLE "ChapterVersion" ADD COLUMN IF NOT EXISTS "content_hash" TEXT;

UPDATE "ChapterVersion"
SET "content_hash" = md5(coalesce("content", ''))
WHERE "content_hash" IS NULL;

CREATE INDEX IF NOT EXISTS "ChapterVersion_chapter_id_content_hash_idx"
  ON "ChapterVersion" ("chapter_id", "content_hash");
